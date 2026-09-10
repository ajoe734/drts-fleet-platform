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
PARENT_CANDIDATE_SHA = "68583755566608e636642f80206a941c612502ab"


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


def _extract_run_block(text: str, after_marker: str) -> str:
    """Pull the shell body of the `run: |` step that follows `after_marker`
    in the workflow YAML and dedent it into a standalone, executable script."""
    tail = text.split(after_marker, 1)[1]
    run_marker = "run: |\n"
    run_start = tail.index(run_marker) + len(run_marker)
    tail = tail[run_start:]
    next_step = re.search(r"\n      - ", tail)
    body = tail[: next_step.start()] if next_step else tail
    return textwrap.dedent(body)


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
        self.assertIn("claude/sr-qa-webhook-001-acceptance-runner", push_block)
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

    def test_overlays_only_the_corrected_harness_file_from_workflow_sha(self) -> None:
        # The checked-in harness at the locked PARENT_CANDIDATE_SHA is known
        # broken (run 34463084508: unseeded tenant principal, verifyAccessToken
        # returns null). This candidate must stay byte-for-byte immutable, so
        # the corrected fixture can only be overlaid from WORKFLOW_SHA onto the
        # checkout -- and the step must refuse to proceed if that overlay ever
        # touches anything beyond this single test file.
        overlay_block = self.text.split(
            "Overlay corrected harness test file from this workflow revision", 1
        )[1][:3000]
        self.assertIn(f'git show "${{WORKFLOW_SHA}}:${{HARNESS_PATH}}"', overlay_block)
        self.assertIn("git status --porcelain", overlay_block)
        self.assertIn("exit 1", overlay_block)
        self.assertIn("HARNESS_ORIGINAL_SHA256", overlay_block)
        self.assertIn("HARNESS_OVERLAY_SHA256", overlay_block)
        self.assertIn(TEST_PATH, overlay_block)
        # The overlay step must run before the candidate is built/tested, not
        # merely exist somewhere in the file.
        overlay_index = self.text.index(
            "Overlay corrected harness test file from this workflow revision"
        )
        harness_run_index = self.text.index(
            "Run full AppModule two-tenant JWT HTTP/SQL acceptance harness"
        )
        self.assertLess(overlay_index, harness_run_index)

    def test_run_status_records_harness_overlay_provenance(self) -> None:
        # Acceptance evidence must never be mistaken for "unchanged original
        # harness execution": run-status.json has to name the exact runtime
        # candidate, the workflow revision that supplied the overlay, and a
        # content hash of the overlaid harness file.
        status_block = self.text.split("Record run status", 1)[1][:4000]
        self.assertIn("harness_overlay", status_block)
        self.assertIn("HARNESS_ORIGINAL_SHA256", status_block)
        self.assertIn("HARNESS_OVERLAY_SHA256", status_block)
        self.assertIn("overlay_outcome", status_block)
        self.assertIn("steps.overlay.outcome", status_block)


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
        overlay: str = "success",
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
                    "OVERLAY_OUTCOME": overlay,
                    "INSTALL_OUTCOME": install,
                    "MIGRATE_OUTCOME": migrate,
                    "HARNESS_OUTCOME": harness,
                    "GATE_OUTCOME": gate,
                    "CANDIDATE_SHA": PARENT_CANDIDATE_SHA,
                    "WORKFLOW_SHA": "f" * 40,
                    "HARNESS_PATH": TEST_PATH,
                    "HARNESS_ORIGINAL_SHA256": "a" * 64,
                    "HARNESS_OVERLAY_SHA256": "b" * 64,
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

    def test_records_harness_overlay_provenance(self) -> None:
        # This is the evidence that lets a reviewer tell the difference
        # between "ran the original candidate's harness unmodified" and "ran
        # a corrected harness overlaid from a separate workflow revision".
        status = self._run()
        self.assertEqual(status["overlay_outcome"], "success")
        self.assertEqual(status["harness_overlay"]["path"], TEST_PATH)
        self.assertEqual(status["harness_overlay"]["original_sha256"], "a" * 64)
        self.assertEqual(status["harness_overlay"]["overlay_sha256"], "b" * 64)

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


class OverlayStepScriptBehaviorTests(unittest.TestCase):
    """Executes the embedded overlay-step shell script for real, against
    isolated git fixtures, instead of only checking for token presence.

    An independent review round found a real bug this way: the original
    script required `git status --porcelain` to report exactly the harness
    path as modified, which rejects a candidate whose checked-in harness
    already matches the workflow revision's corrected fixture byte-for-byte
    (a legitimate zero-diff overlay outcome), even though neither the
    product source nor the candidate HEAD changed. Regex-checking the
    script text for `exit 1` and `git status --porcelain` did not catch
    this, because both were present -- just gating the wrong condition.
    """

    HARNESS_PATH = TEST_PATH

    def setUp(self) -> None:
        self.assertTrue(WORKFLOW.exists(), f"missing {WORKFLOW}")
        self.script = _extract_run_block(
            WORKFLOW.read_text(encoding="utf-8"),
            "Overlay corrected harness test file from this workflow revision",
        )
        # Fail fast with a clear message if the extraction ever grabs an
        # empty/malformed block instead of silently passing every scenario.
        self.assertIn("git show", self.script)
        self.assertIn("git status --porcelain", self.script)

    def _git(self, cwd: str, *args: str) -> None:
        subprocess.run(
            ["git", *args],
            cwd=cwd,
            check=True,
            capture_output=True,
            text=True,
            env={
                **os.environ,
                "GIT_AUTHOR_NAME": "test",
                "GIT_AUTHOR_EMAIL": "test@example.com",
                "GIT_COMMITTER_NAME": "test",
                "GIT_COMMITTER_EMAIL": "test@example.com",
            },
        )

    def _init_repo(self, tmp: str) -> None:
        # The overlay script writes GITHUB_ENV and the .artifacts log inside
        # cwd; ignore them from commit 0 so they never show up as untracked
        # noise in the `git status --porcelain` checks below.
        self._git(tmp, "init", "-q")
        Path(tmp, ".gitignore").write_text(".artifacts/\ngithub_env.txt\n")
        self._git(tmp, "add", "-A")
        self._git(tmp, "commit", "-m", "init")

    def _commit(self, tmp: str, harness_body: str, product_body: str) -> str:
        Path(tmp, self.HARNESS_PATH).parent.mkdir(parents=True, exist_ok=True)
        Path(tmp, self.HARNESS_PATH).write_text(harness_body)
        Path(tmp, "product.ts").write_text(product_body)
        self._git(tmp, "add", "-A")
        self._git(tmp, "commit", "-m", "fixture")
        return subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=tmp, check=True, capture_output=True, text=True,
        ).stdout.strip()

    def _run_overlay(self, tmp: str, workflow_sha: str) -> subprocess.CompletedProcess:
        env = dict(os.environ)
        env.update(
            {
                "HARNESS_PATH": self.HARNESS_PATH,
                "WORKFLOW_SHA": workflow_sha,
                "CANDIDATE_SHA": "c" * 40,
                "GITHUB_ENV": str(Path(tmp) / "github_env.txt"),
            }
        )
        Path(tmp, ".artifacts", "tenant-binding-acceptance").mkdir(
            parents=True, exist_ok=True
        )
        Path(env["GITHUB_ENV"]).write_text("")
        return subprocess.run(
            ["bash", "-c", self.script],
            cwd=tmp,
            env=env,
            capture_output=True,
            text=True,
        )

    def test_older_harness_overlay_passes(self) -> None:
        # Candidate (HEAD) carries the broken/older harness; a later
        # workflow commit supplies the corrected one. This is the normal,
        # expected overlay: exactly the harness file changes.
        with tempfile.TemporaryDirectory() as tmp:
            self._init_repo(tmp)
            candidate_sha = self._commit(tmp, "old harness\n", "product v1\n")
            workflow_sha = self._commit(tmp, "corrected harness\n", "product v1\n")
            self._git(tmp, "checkout", candidate_sha)

            result = self._run_overlay(tmp, workflow_sha)

            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertEqual(
                Path(tmp, self.HARNESS_PATH).read_text(), "corrected harness\n"
            )
            self.assertEqual(Path(tmp, "product.ts").read_text(), "product v1\n")

    def test_identical_harness_overlay_passes(self) -> None:
        # Candidate (HEAD) already carries the corrected harness verbatim:
        # `git show` overwrites the file with identical bytes, so `git
        # status --porcelain` reports no change at all. This must be
        # accepted, not rejected -- product/runtime content is still
        # provably unchanged, it just never needed an overlay.
        with tempfile.TemporaryDirectory() as tmp:
            self._init_repo(tmp)
            candidate_sha = self._commit(tmp, "corrected harness\n", "product v1\n")
            self._git(tmp, "checkout", candidate_sha)

            result = self._run_overlay(tmp, candidate_sha)

            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertEqual(
                Path(tmp, self.HARNESS_PATH).read_text(), "corrected harness\n"
            )
            self.assertEqual(Path(tmp, "product.ts").read_text(), "product v1\n")

    def test_unexpected_product_edit_still_fails(self) -> None:
        # Same as the older-harness case, but the candidate checkout also
        # carries an out-of-scope product change. The overlay must still
        # refuse to proceed, regardless of what the harness diff looks like.
        with tempfile.TemporaryDirectory() as tmp:
            self._init_repo(tmp)
            candidate_sha = self._commit(tmp, "old harness\n", "product v1\n")
            workflow_sha = self._commit(tmp, "corrected harness\n", "product v1\n")
            self._git(tmp, "checkout", candidate_sha)
            Path(tmp, "product.ts").write_text("unexpected product edit\n")

            result = self._run_overlay(tmp, workflow_sha)

            self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
            self.assertIn("::error::", result.stdout)
            # The unexpected product edit must survive untouched for the
            # error message/evidence to show what actually diverged.
            self.assertEqual(
                Path(tmp, "product.ts").read_text(), "unexpected product edit\n"
            )


if __name__ == "__main__":
    unittest.main()
