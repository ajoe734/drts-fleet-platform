import copy
import importlib.util
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


HELPER = Path(__file__).resolve().parents[2] / "e2e/pax-bureau-acceptance/shared-runtime-check.py"
SPEC = importlib.util.spec_from_file_location("bureau_runtime", HELPER)
runtime = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runtime)
SHA = "a" * 40


class SharedRuntimeBindingTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        previous = Path.cwd()
        os.chdir(self.temp.name)
        self.addCleanup(os.chdir, previous)
        self.env = {
            "GITHUB_ACTIONS": "true", "GITHUB_SHA": SHA,
            "EXPECTED_DEFINITION_SHA": SHA, "EXPECTED_RUNTIME_SHA": SHA,
            "DEV_GCP_PROJECT_ID": "drts-dev-devcc-20260825", "DEV_GCP_REGION": "us-central1",
            "GITHUB_OUTPUT": str(Path(self.temp.name) / "outputs"),
            "PAX_BUREAU_PHONES": json.dumps(dict(zip(
                ("consent", "wrong", "resend", "expiry", "returning", "trip", "reliability", "matching"),
                (f"09000000{value:02}" for value in range(10, 18)),
            ))),
        }
        self.services = {}
        self.revisions = {}
        for name in ("drts-dev-api", "drts-dev-ops-console-web", "drts-dev-passenger-app-web"):
            revision = f"{name}-00001-abc"
            self.services[name] = {"status": {
                "latestReadyRevisionName": revision, "latestCreatedRevisionName": revision,
                "traffic": [{"percent": 100, "revisionName": revision}],
                "url": f"https://{name}-example-uc.a.run.app",
            }}
            self.revisions[revision] = {"spec": {"containers": [{"env": [
                {"name": "DRTS_CANDIDATE_SHA", "value": SHA},
                {"name": "PAX_REVIEW_DEMO_ENABLED", "value": "true"},
                {"name": "PAX_PUBLIC_PASSENGER_ONLY", "value": str("passenger" in name).lower()},
                {"name": "UNRELATED_SECRET", "value": "must-not-be-published"},
            ]}]}}
        self.bindings = {"bindings": [{"role": "roles/run.invoker", "members": ["serviceAccount:existing"]}]}

    def cloud(self, kind, name, operation="describe"):
        if operation == "get-iam-policy":
            return copy.deepcopy(self.bindings)
        return copy.deepcopy((self.services if kind == "services" else self.revisions)[name])

    def run_phase(self, phase="before"):
        with patch.dict(os.environ, self.env, clear=True), \
                patch.object(sys, "argv", [str(HELPER), "--phase", phase]), \
                patch.object(runtime.subprocess, "check_output", return_value=SHA + "\n"), \
                patch.object(runtime, "cloud", side_effect=self.cloud) as cloud:
            runtime.main()
            return cloud

    def test_three_live_revisions_are_bound_without_credentials_or_raw_environment(self):
        self.run_phase()
        self.run_phase("after")
        data = json.loads(Path(".artifacts/pax-bureau-acceptance/shared-runtime-after.json").read_text())
        self.assertEqual(set(data["services"]), {"api", "ops", "pax"})
        self.assertEqual(data["runtimeSha"], SHA)
        self.assertEqual(data["matchingTimeoutMs"], 90_000)
        self.assertNotIn("must-not-be-published", json.dumps(data))
        self.assertNotIn("0900000010", json.dumps(data))

    def test_live_matching_configuration_is_read_back_without_overriding_it(self):
        self.revisions["drts-dev-api-00001-abc"]["spec"]["containers"][0]["env"].append(
            {"name": "DISPATCH_MATCHING_TIMEOUT_MS", "value": "30000"})
        self.run_phase()
        data = json.loads(Path(".artifacts/pax-bureau-acceptance/shared-runtime-before.json").read_text())
        self.assertEqual(data["matchingTimeoutMs"], 30_000)

    def test_changed_api_source_is_rejected(self):
        env = self.revisions["drts-dev-api-00001-abc"]["spec"]["containers"][0]["env"]
        env[0]["value"] = "b" * 40
        with self.assertRaisesRegex(RuntimeError, "runtime SHA differs"):
            self.run_phase()

    def test_split_or_stale_traffic_is_rejected(self):
        self.services["drts-dev-ops-console-web"]["status"]["traffic"][0]["percent"] = 50
        with self.assertRaisesRegex(RuntimeError, "split or stale traffic"):
            self.run_phase()

    def test_public_ops_is_rejected(self):
        self.bindings["bindings"][0]["members"].append("allUsers")
        with self.assertRaisesRegex(RuntimeError, "Ops must remain private"):
            self.run_phase()

    def test_non_current_target_and_duplicate_phone_are_rejected(self):
        self.env["DEV_GCP_PROJECT_ID"] = "historical-suspended-target"
        with self.assertRaisesRegex(RuntimeError, "Live target differs"):
            self.run_phase()
        self.env["DEV_GCP_PROJECT_ID"] = "drts-dev-devcc-20260825"
        phones = json.loads(self.env["PAX_BUREAU_PHONES"])
        phones["wrong"] = phones["consent"]
        self.env["PAX_BUREAU_PHONES"] = json.dumps(phones)
        with self.assertRaisesRegex(RuntimeError, "identities must be distinct"):
            self.run_phase()

    def test_changed_revision_after_the_journey_cannot_claim_same_release(self):
        self.run_phase()
        service = self.services["drts-dev-api"]["status"]
        newer = "drts-dev-api-00002-def"
        self.revisions[newer] = copy.deepcopy(self.revisions[service["latestReadyRevisionName"]])
        service.update(latestReadyRevisionName=newer, latestCreatedRevisionName=newer,
                       traffic=[{"percent": 100, "revisionName": newer}])
        with self.assertRaisesRegex(RuntimeError, "Runtime changed during the journey"):
            self.run_phase("after")


if __name__ == "__main__":
    unittest.main()
