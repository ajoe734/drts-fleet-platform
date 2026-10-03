"""Execute real runner against fake external CLIs. No live service is started."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

REPO = Path(__file__).resolve().parents[4]
INFRA = REPO / "infra/gcp/dev/ops-drill"
sys.path.insert(0, str(INFRA))
spec = importlib.util.spec_from_file_location("restore_drill", INFRA / "restore_drill.py")
drill = importlib.util.module_from_spec(spec)
spec.loader.exec_module(drill)
sys.modules["restore_drill"] = drill
import provision_drill_sa as provision  # noqa: E402


class Clock:
    def __init__(self):
        self.value = 0

    def monotonic(self):
        self.value += 0.01
        return self.value

    def sleep(self, seconds):
        self.value += seconds


class RestoreDrillTest(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory(prefix="ops-drill-unit-")
        self.addCleanup(self.folder.cleanup)
        self.root = Path(self.folder.name)
        fixture = Path(__file__).with_name("fake_cli.py")
        for binary, kind in (("gcloud", "gcloud"), ("psql", "psql"), ("cloud-sql-proxy", "proxy"), ("gh", "gh")):
            wrapper = self.root / binary
            wrapper.write_text(f'#!/bin/sh\nexec "{sys.executable}" "{fixture}" "{kind}" "$@"\n')
            wrapper.chmod(0o755)
        sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=REPO, text=True).strip()
        self.env = {"PATH": str(self.root) + ":" + os.environ["PATH"], "DRILL_FAKE_DIR": str(self.root),
                    "GITHUB_ACTIONS": "true", "RUNNER_ENVIRONMENT": "github-hosted", "GITHUB_REPOSITORY": "ajoe734/drts-fleet-platform",
                    "GITHUB_REF": "refs/heads/main", "GITHUB_RUN_ID": "123", "GITHUB_RUN_ATTEMPT": "1",
                    "DEV_GCP_PROJECT_ID": drill.PROJECT, "DEV_GCP_REGION": drill.REGION,
                    "DEV_GCP_CLOUDSQL_INSTANCE": f"{drill.PROJECT}:{drill.REGION}:{drill.SOURCE}",
                    "CANDIDATE_SHA": sha, "BASE_SHA": sha}
        self.target = "drts-dev-db-drill-123-1"
        self.output = self.root / "evidence.json"
        self.clock = Clock()
        for mock in (patch.dict(os.environ, self.env), patch.object(drill.time, "monotonic", self.clock.monotonic), patch.object(drill.time, "sleep", self.clock.sleep)):
            mock.start()
            self.addCleanup(mock.stop)

    def calls(self):
        path = self.root / "commands.jsonl"
        return [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []

    def execute(self, scenario="success", success=False):
        with patch.dict(os.environ, {"DRILL_FAKE_SCENARIO": scenario}):
            if success:
                drill.run(self.target, self.output)
            else:
                with self.assertRaises(drill.DrillError):
                    drill.run(self.target, self.output)
        raw = self.output.read_text()
        self.assertNotIn("TOP-SECRET", raw + json.dumps(self.calls()))
        return json.loads(raw)

    def deleted(self):
        return any(call[1:4] == ["sql", "instances", "delete"] for call in self.calls())

    def test_success_reads_both_source_and_clone_then_confirms_deletion(self):
        result = self.execute(success=True)
        self.assertEqual(result["status"], "restore_readback_passed")
        self.assertEqual(result["cleanup"]["status"], "deleted")
        self.assertEqual(len(result["clone_readback"]["tables"]), 4)
        self.assertGreater(result["rto_readable_seconds"], result["rto_runnable_seconds"])
        self.assertIn("not a proven data-loss bound", result["rpo_observation"]["meaning"])
        self.assertEqual(result["capacity_acceptance"], "pending_representative_workload_and_SLO")
        self.assertTrue(self.deleted())
        self.assertFalse((self.root / "created").exists())
        self.assertEqual(sum(call[0] == "psql" for call in self.calls()), 3)

    def test_name_guards_before_any_cli_or_cleanup(self):
        for target in ("drts-dev-db", "drts-dev-primary-db", "drts-dev-db-drill-../../x", "other-db", "drts-dev-db-drill-123-2"):
            with self.subTest(target=target), self.assertRaises(drill.DrillError):
                drill.run(target, self.output)
        self.assertEqual(self.calls(), [])

    def test_vm_guard(self):
        with patch.dict(os.environ, {"RUNNER_ENVIRONMENT": "self-hosted"}), self.assertRaises(drill.DrillError):
            drill.run(self.target, self.output)
        self.assertEqual(self.calls(), [])

    def test_candidate_checkout_mismatch(self):
        with patch.dict(os.environ, {"CANDIDATE_SHA": "0" * 40}), self.assertRaises(drill.DrillError):
            drill.run(self.target, self.output)
        self.assertEqual(self.calls(), [])

    def test_preexisting_target_is_never_deleted(self):
        result = self.execute("preexisting")
        self.assertEqual(result["failure_code"], "target_already_exists_do_not_delete")
        self.assertFalse(self.deleted())

    def test_permission_error_is_not_treated_as_absence(self):
        self.execute("describe_denied")
        self.assertFalse(self.deleted())
        self.assertFalse(any(call[1:4] == ["sql", "instances", "clone"] for call in self.calls()))

    def test_disabled_pitr_blocks_before_clone(self):
        self.execute("no_pitr")
        self.assertFalse(self.deleted())

    def test_stale_recovery_window_blocks_before_secret_or_clone(self):
        self.execute("stale_point")
        self.assertFalse(any(call[1:3] == ["secrets", "versions"] for call in self.calls()))

    def test_secret_errors_are_not_printed_and_do_not_create_resources(self):
        result = self.execute("secret_failure")
        self.assertEqual(result["failure_code"], "child_command_failed")
        self.assertFalse(self.deleted())

    def test_clone_api_failure_still_deletes_possible_resource(self):
        result = self.execute("clone_failure")
        self.assertTrue(self.deleted())
        self.assertEqual(result["cleanup"]["status"], "deleted")

    def test_missing_operation_is_failure_with_cleanup(self):
        result = self.execute("missing_operation")
        self.assertEqual(result["failure_code"], "clone_operation_missing")
        self.assertTrue(self.deleted())

    def test_operation_error_is_failure_with_cleanup(self):
        result = self.execute("operation_error")
        self.assertEqual(result["failure_code"], "clone_operation_failed")
        self.assertTrue(self.deleted())

    def test_readback_failure_cleans_clone(self):
        self.execute("readback_failure")
        self.assertTrue(self.deleted())

    def test_missing_table_is_nonzero(self):
        self.execute("missing_table")
        self.assertFalse(self.deleted())  # Source preflight fails before clone.

    def test_counts_mismatch_never_claims_success_and_still_deletes(self):
        result = self.execute("mismatch")
        self.assertEqual(result["failure_code"], "readback_mismatch_or_concurrent_source_change")
        self.assertEqual(result["status"], "failed")
        self.assertTrue(self.deleted())

    def test_future_write_is_rejected(self):
        self.execute("post_point")
        self.assertTrue(self.deleted())

    def test_cleanup_failure_overrides_success(self):
        result = self.execute("cleanup_failure")
        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["cleanup"]["status"], "unconfirmed")

    def test_plan_checks_actual_provider_trust(self):
        result = provision.plan()
        self.assertEqual(result["status"], "blocked_not_applied")
        self.assertFalse(result["proposed_roles"][0]["apply"])
        with patch.dict(os.environ, {"DRILL_FAKE_SCENARIO": "bad_trust"}), self.assertRaises(drill.DrillError):
            provision.plan()

    def test_apply_fails_before_any_iam_write(self):
        result = subprocess.run(["bash", str(INFRA / "provision-drill-sa.sh"), "--apply"], capture_output=True, text=True)
        self.assertEqual(result.returncode, 2)
        self.assertIn("clone_destination_iam_enforcement_unverified", result.stderr)
        self.assertEqual(self.calls(), [])


if __name__ == "__main__":
    unittest.main()
