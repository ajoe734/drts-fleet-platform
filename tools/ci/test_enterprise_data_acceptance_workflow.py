"""Contract for .github/workflows/enterprise-data-acceptance.yml.

SR-ENTERPRISE-DATA-001 acceptance evidence requires proving, with a real
built enterprise-dispatch-web app driven by Chromium against a real,
unmodified AppModule and a real migrated PostgreSQL:
  - the home upcoming list, the trip page, and the booking-detail page all
    resolve to the exact same real booking (list -> home -> detail
    identity), and a genuinely nonexistent booking id renders an honest
    not-found state, never a retryable "degraded" banner;
  - the driver-contact and support-contact actions on the trip and help
    pages are real, testable navigation/tel/mailto actions, and the
    unavailable driver contact is never faked.

This test file verifies:
- The workflow triggers, input validation, and checkout integrity.
- Postgres service setup and environment variables.
- The real build/seed/serve pipeline (API + enterprise app + Playwright).
- The zero-skip browser gate logic and the run-status computation script.
- The artifact upload configuration (no session tokens uploaded).
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
WORKFLOW = ROOT / ".github" / "workflows" / "enterprise-data-acceptance.yml"
BROWSER_SERVER_PATH = (
    "tests/e2e/system-remediation/sr-enterprise-data-001/"
    "enterprise-data-browser-server.mjs"
)
BROWSER_SPEC_PATH = (
    "tests/e2e/system-remediation/sr-enterprise-data-001/"
    "enterprise-data-browser.spec.ts"
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


class EnterpriseDataAcceptanceWorkflowTests(unittest.TestCase):
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
        self.assertIn(
            "claude/sr-enterprise-data-001-recovery-20260911", push_block
        )
        self.assertIn(
            ".github/workflows/enterprise-data-acceptance.yml", push_block
        )
        self.assertIn(
            "tools/ci/test_enterprise_data_acceptance_workflow.py", push_block
        )
        self.assertIn(
            "tests/e2e/system-remediation/sr-enterprise-data-001/**", push_block
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
        self.assertIn("DRTS_ENTERPRISE_DATA_DATABASE_URL:", self.text)

    def test_builds_real_api_and_enterprise_app_before_migrating_and_seeding(
        self,
    ) -> None:
        for command in (
            "pnpm --filter @drts/ui-tokens build",
            "pnpm --filter @drts/api build",
            "pnpm --filter @drts/enterprise-dispatch-web build",
        ):
            self.assertIn(command, self.text)
        build_idx = self.text.find("pnpm --filter @drts/enterprise-dispatch-web build")
        migrate_idx = self.text.find("pnpm db:migrate")
        seed_idx = self.text.find(BROWSER_SERVER_PATH)
        harness_idx = self.text.find("pnpm exec playwright test")
        self.assertNotEqual(migrate_idx, -1, "missing pnpm db:migrate")
        self.assertNotEqual(seed_idx, -1, "missing browser server invocation")
        self.assertLess(build_idx, migrate_idx, "build must run before migration")
        self.assertLess(migrate_idx, seed_idx, "migrations must run before seeding/serving")
        self.assertLess(seed_idx, harness_idx, "server must start before the harness runs")

    def test_starts_real_servers_and_polls_readiness_before_harness(self) -> None:
        self.assertIn("next start", self.text)
        self.assertIn("http://127.0.0.1:4103/api/auth/session", self.text)
        self.assertIn("http://127.0.0.1:3011/help", self.text)

    def test_harness_runs_the_browser_spec_serially(self) -> None:
        self.assertIn(BROWSER_SPEC_PATH, self.text)
        self.assertIn("--workers=1", self.text)

    def test_stops_server_process_groups_always(self) -> None:
        stop_block = self.text.split("Stop acceptance server process groups", 1)[1][:600]
        self.assertIn("if: always()", stop_block[:100])
        self.assertIn("kill -- \"-$(cat", stop_block)

    def test_gate_rejects_missing_skipped_failed_or_partial_report(self) -> None:
        script = _extract_heredoc(self.text, "PY_GATE")
        with tempfile.TemporaryDirectory() as td:
            report = Path(td) / "test-results/system-remediation-report.json"
            report.parent.mkdir()
            cases = [
                ({"stats": {"expected": 6, "unexpected": 0, "skipped": 0, "flaky": 0}}, True),
                ({"stats": {"expected": 5, "unexpected": 0, "skipped": 0}}, False),
                ({"stats": {"expected": 6, "skipped": 1}}, False),
                ({"stats": {"expected": 6, "unexpected": 1}}, False),
                ({"stats": {"expected": 6}, "errors": [{"message": "worker crashed"}]}, False),
                ({}, False),
            ]
            for data, expected in cases:
                with self.subTest(data=data):
                    report.write_text(json.dumps(data))
                    result = subprocess.run(
                        [sys.executable, "-c", script], cwd=td, capture_output=True
                    )
                    self.assertEqual(result.returncode == 0, expected)
            report.unlink()
            self.assertNotEqual(
                subprocess.run(
                    [sys.executable, "-c", script], cwd=td, capture_output=True
                ).returncode,
                0,
            )

    def test_status_requires_every_actual_step_to_succeed(self) -> None:
        script = _extract_heredoc(self.text, "PY_STATUS")
        names = ("INSTALL", "BROWSER_INSTALL", "BUILD", "MIGRATE", "API", "PORTAL", "HARNESS", "GATE")
        with tempfile.TemporaryDirectory() as td:
            report = Path(td) / "test-results/system-remediation-report.json"
            report.parent.mkdir()
            report.write_text(json.dumps({"stats": {"expected": 6}}))
            import os

            env = {**os.environ, **{f"{name}_OUTCOME": "success" for name in names}, "CANDIDATE_SHA": "a" * 40, "WORKFLOW_SHA": "b" * 40}
            status = Path(td) / ".artifacts/enterprise-data-acceptance/browser/run-status.json"
            subprocess.run([sys.executable, "-c", script], cwd=td, env=env, check=True, capture_output=True)
            self.assertEqual(json.loads(status.read_text())["status"], "passed")
            for name in names:
                with self.subTest(step=name):
                    failed = {**env, f"{name}_OUTCOME": "failure"}
                    subprocess.run([sys.executable, "-c", script], cwd=td, env=failed, check=True, capture_output=True)
                    self.assertEqual(json.loads(status.read_text())["status"], "failed")
            report.unlink()
            subprocess.run([sys.executable, "-c", script], cwd=td, env=env, check=True, capture_output=True)
            self.assertEqual(json.loads(status.read_text())["status"], "failed")

    def test_uploads_evidence_without_session_tokens(self) -> None:
        upload_block = self.text.split("actions/upload-artifact@v4", 1)[1]
        step_prefix = self.text.split("actions/upload-artifact@v4", 1)[0].rsplit(
            "- name:", 1
        )[1]
        self.assertIn("if: always()", step_prefix)
        self.assertNotIn("sessions.private.json", upload_block)
        self.assertIn("seed-data.json", upload_block)
        self.assertIn("run-status.json", upload_block)
        self.assertIn("*.log", upload_block)

    def test_browser_server_seeds_before_app_init_and_validates_readback(self) -> None:
        server_path = ROOT / BROWSER_SERVER_PATH
        self.assertTrue(server_path.exists(), f"missing {server_path}")
        server_text = server_path.read_text(encoding="utf-8")
        seed_idx = server_text.find("await seedActiveBooking()")
        boot_idx = server_text.find("NestFactory.create(AppModule")
        self.assertNotEqual(seed_idx, -1)
        self.assertNotEqual(boot_idx, -1)
        self.assertLess(
            seed_idx,
            boot_idx,
            "the seeded booking must exist in Postgres before AppModule boots, "
            "because OwnedMobilityService only hydrates its in-memory order "
            "cache once, in onModuleInit",
        )
        self.assertIn("readback", server_text)
        self.assertIn("GITHUB_ACTIONS", server_text)
        self.assertIn("nonexistentBookingId", server_text)

    def test_browser_spec_covers_identity_honest_errors_and_contact_actions(
        self,
    ) -> None:
        spec_path = ROOT / BROWSER_SPEC_PATH
        self.assertTrue(spec_path.exists(), f"missing {spec_path}")
        spec_text = spec_path.read_text(encoding="utf-8")
        for marker in (
            "enterprise-home-upcoming-",
            "enterprise-booking-detail-id",
            "enterprise-trip-contact-driver",
            "enterprise-trip-contact-support",
            "enterprise-booking-not-found",
            "enterprise-booking-api-state",
            "enterprise-help-call",
            "enterprise-help-online",
            "enterprise-home-upcoming-empty",
            "enterprise-trip-empty",
            "toBeDisabled",
        ):
            self.assertIn(marker, spec_text, f"browser spec missing coverage for {marker}")


if __name__ == "__main__":
    unittest.main()
