"""Socket-free semantic controls for the actual hosted metadata collector."""
import copy
import importlib.util
import json
import os
import pathlib
import types
import unittest
from unittest.mock import patch

SOURCE = pathlib.Path(__file__).resolve().parents[2] / "e2e" / "owned-referral-business-journey" / "runtime-check.py"
SPEC = importlib.util.spec_from_file_location("owned_runtime_check", SOURCE)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("actual runtime collector source required")
runtime = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runtime)
SHA = "a" * 40


def metadata(service="drts-dev-api"):
    revision = service + "-00042-test"
    return {
        "spec": {"template": {"spec": {"containers": [{"env": [{"name": "DRTS_CANDIDATE_SHA", "value": SHA}]}]}}},
        "status": {"latestReadyRevisionName": revision, "latestCreatedRevisionName": revision,
                   "url": "https://" + service + "-example-uc.a.run.app",
                   "traffic": [{"revisionName": revision, "percent": 100}]},
    }


class RuntimeTrafficControls(unittest.TestCase):
    def validate(self, data):
        return runtime.validate_service("api", "drts-dev-api", data, SHA)

    def test_latest_source_with_old_positive_traffic_is_rejected(self):
        data = metadata()
        data["status"]["traffic"] = [{"revisionName": "old-revision", "percent": 100}]
        with self.assertRaisesRegex(RuntimeError, "positive traffic"):
            self.validate(data)

    def test_split_old_positive_traffic_is_rejected(self):
        data = metadata()
        data["status"]["traffic"][0]["percent"] = 50
        data["status"]["traffic"].append({"revisionName": "old-revision", "percent": 50})
        with self.assertRaisesRegex(RuntimeError, "positive traffic"):
            self.validate(data)

    def test_canonical_allocation_must_be_present_and_total_one_hundred(self):
        for traffic in [None, [], [{"revisionName": "drts-dev-api-00042-test", "percent": 99}]]:
            with self.subTest(traffic=traffic):
                data = metadata()
                data["status"]["traffic"] = traffic
                with self.assertRaises(RuntimeError):
                    self.validate(data)

    def test_invalid_percentages_are_not_treated_as_zero_tags(self):
        for percent in [-1, 101, True, 50.5, "100"]:
            with self.subTest(percent=percent):
                data = metadata()
                data["status"]["traffic"][0]["percent"] = percent
                with self.assertRaisesRegex(RuntimeError, "invalid traffic"):
                    self.validate(data)

    def test_zero_percent_old_tags_are_allowed_without_crediting_them_as_active(self):
        data = metadata()
        data["status"]["traffic"].append({"revisionName": "old-revision", "percent": 0, "tag": "historical"})
        data["status"]["traffic"].append({"revisionName": "another-old", "tag": "no-allocation"})
        result = self.validate(data)
        self.assertEqual(result["activeTraffic"], [{"revision": "drts-dev-api-00042-test", "percent": 100}])

    def test_all_active_percentages_can_only_name_the_ready_created_revision(self):
        data = metadata()
        revision = data["status"]["latestReadyRevisionName"]
        data["status"]["traffic"] = [{"revisionName": revision, "percent": 60}, {"revisionName": revision, "percent": 40}]
        self.assertEqual(sum(item["percent"] for item in self.validate(data)["activeTraffic"]), 100)
        data["status"]["latestCreatedRevisionName"] = "different-new-revision"
        with self.assertRaisesRegex(RuntimeError, "not stable"):
            self.validate(data)

    def test_collect_uses_actual_validator_for_all_five_fixed_readonly_describes(self):
        calls = []

        def describe(command, **options):
            self.assertEqual(command[:4], ["gcloud", "run", "services", "describe"])
            self.assertEqual(command[5:], ["--project=drts-dev-devcc-20260825", "--region=us-central1", "--format=json"])
            self.assertTrue(options["capture_output"])
            self.assertFalse(options["check"])
            calls.append(command[4])
            return types.SimpleNamespace(returncode=0, stdout=json.dumps(metadata(command[4])).encode())

        with patch.dict(os.environ, {"EXPECTED_RUNTIME_SHA": SHA, "DEV_GCP_PROJECT_ID": "drts-dev-devcc-20260825", "DEV_GCP_REGION": "us-central1"}):
            with patch.object(runtime.subprocess, "run", side_effect=describe):
                rows = runtime.collect()
        self.assertEqual(calls, list(runtime.SERVICES.values()))
        self.assertEqual(set(rows), set(runtime.SERVICES))
        self.assertTrue(all(sum(target["percent"] for target in row["activeTraffic"]) == 100 for row in rows.values()))

    def test_collect_does_not_credit_latest_env_when_one_service_routes_to_old(self):
        def describe(command, **_options):
            value = copy.deepcopy(metadata(command[4]))
            if command[4] == runtime.SERVICES["fleet"]:
                value["status"]["traffic"][0]["revisionName"] = "old-fleet"
            return types.SimpleNamespace(returncode=0, stdout=json.dumps(value).encode())

        with patch.dict(os.environ, {"EXPECTED_RUNTIME_SHA": SHA, "DEV_GCP_PROJECT_ID": "drts-dev-devcc-20260825", "DEV_GCP_REGION": "us-central1"}):
            with patch.object(runtime.subprocess, "run", side_effect=describe):
                with self.assertRaisesRegex(RuntimeError, "positive traffic"):
                    runtime.collect()


if __name__ == "__main__":
    unittest.main()
