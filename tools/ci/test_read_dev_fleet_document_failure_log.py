"""Pure controlled Logging ports: no subprocess, credentials, or product calls."""
import importlib.util
import json
from pathlib import Path
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "operations/verification/read-dev-fleet-document-failure-log.py"
SPEC = importlib.util.spec_from_file_location("fleet_failure_readback", SOURCE)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
D = "a" * 40
ENV = {
    "EXPECTED_DEFINITION_SHA": D, "GITHUB_SHA": D,
    "DEV_GCP_PROJECT_ID": MODULE.PROJECT, "DEV_GCP_REGION": MODULE.REGION,
}
TRACE = f"projects/{MODULE.PROJECT}/traces/" + "b" * 32


def request_row(path=MODULE.DOCUMENT_PATH, method="PUT", trace=TRACE):
    return {
        "resource": {"type": "cloud_run_revision", "labels": {
            "project_id": MODULE.PROJECT, "location": MODULE.REGION,
            "service_name": MODULE.SERVICE, "revision_name": MODULE.REVISION,
        }},
        "timestamp": "2026-10-20T14:40:08.123456789Z", "severity": "ERROR",
        "trace": trace, "httpRequest": {
            "requestMethod": method,
            "requestUrl": "https://private-api.example" + path + "?objectKey=private",
            "status": 500, "latency": "0.123456s",
        },
    }


class Port:
    def __init__(self, *responses):
        self.responses = list(responses)
        self.calls = []

    def __call__(self, command, **kwargs):
        self.calls.append((command, kwargs))
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


def success(rows):
    return subprocess.CompletedProcess([], 0, json.dumps(rows), "")


class FixedFailureReadbackTests(unittest.TestCase):
    def test_both_original_routes_and_only_their_observed_trace(self):
        application = request_row()
        del application["httpRequest"]
        application["jsonPayload"] = {"error": {"name": "DatabaseError", "code": "57P01"}}
        port = Port(success([request_row(), request_row(MODULE.REVOKE_PATH, "POST")]),
                    success([request_row(), application]))
        actual = MODULE.collect(ENV, port)
        self.assertIsNone(actual["readFailureCode"])
        self.assertEqual(actual["readStatus"], "request-metadata-observed")
        self.assertEqual([row["route"] for row in actual["requests"]],
                         ["fleet-document-content", "own-partner-session-revoke"])
        self.assertEqual(actual["correlatedApplication"][0]["errorCodes"], ["57P01"])
        self.assertEqual(actual["queryCount"], 2)
        for command, kwargs in port.calls:
            self.assertEqual(command[:3], ["gcloud", "logging", "read"])
            self.assertEqual(command[command.index("--project") + 1], MODULE.PROJECT)
            self.assertIn(MODULE.REVISION, command[3])
            self.assertIn(MODULE.START, command[3])
            self.assertIn(MODULE.END, command[3])
            self.assertEqual(kwargs["timeout"], 90)
        self.assertIn('httpRequest.status=500', port.calls[0][0][3])

    def test_raw_message_body_headers_and_query_never_project(self):
        marker = "synthetic-private-value-not-a-credential"
        row = request_row()
        row["textPayload"] = marker
        row["jsonPayload"] = {"headers": {"authorization": marker}, "body": marker}
        port = Port(success([row]), success([]))
        output = json.dumps(MODULE.collect(ENV, port))
        self.assertNotIn(marker, output)
        self.assertNotIn("objectKey", output)
        self.assertNotIn("private-api.example", output)
        self.assertNotIn(TRACE, output)

    def test_wrong_target_rejected_before_any_query(self):
        for field, value in [("DEV_GCP_PROJECT_ID", "foreign"),
                             ("DEV_GCP_REGION", "foreign")]:
            with self.subTest(field=field):
                port = Port()
                actual = MODULE.collect({**ENV, field: value}, port)
                self.assertEqual(actual["readFailureCode"], "DEV_TARGET_MISMATCH")
                self.assertEqual(port.calls, [])

    def test_unfrozen_or_mismatched_definition_rejected_before_query(self):
        for value in ["dev", "", "c" * 40]:
            with self.subTest(value=value):
                port = Port()
                result = MODULE.collect({**ENV, "EXPECTED_DEFINITION_SHA": value}, port)
                self.assertEqual(result["readFailureCode"], "IMMUTABLE_DEFINITION_MISMATCH")
                self.assertEqual(port.calls, [])

    def test_foreign_resource_fields_rejected(self):
        for field in ["project_id", "location", "service_name", "revision_name"]:
            with self.subTest(field=field):
                row = request_row()
                row["resource"]["labels"][field] = "foreign"
                actual = MODULE.collect(ENV, Port(success([row])))
                self.assertEqual(actual["readFailureCode"], "LOG_OUTSIDE_FIXED_RESOURCE")

    def test_wrong_window_rejected(self):
        row = request_row()
        row["timestamp"] = "2026-10-20T14:40:20.001Z"
        result = MODULE.collect(ENV, Port(success([row])))
        self.assertEqual(result["readFailureCode"], "LOG_OUTSIDE_FIXED_WINDOW")

    def test_foreign_route_method_and_non500_rejected(self):
        for field, value in [("requestUrl", "https://private.example/api/other"),
                             ("requestMethod", "GET"), ("status", 200)]:
            with self.subTest(field=field):
                row = request_row()
                row["httpRequest"][field] = value
                result = MODULE.collect(ENV, Port(success([row])))
                self.assertEqual(result["readFailureCode"], "REQUEST_OUTSIDE_FIXED_FAILURES")

    def test_missing_trace_keeps_request_facts_without_broad_query(self):
        port = Port(success([request_row(trace=None)]))
        result = MODULE.collect(ENV, port)
        self.assertIsNone(result["readFailureCode"])
        self.assertEqual(len(port.calls), 1)
        self.assertEqual(result["correlatedApplication"], [])

    def test_foreign_correlated_trace_rejected(self):
        row = request_row(trace=f"projects/{MODULE.PROJECT}/traces/" + "c" * 32)
        del row["httpRequest"]
        result = MODULE.collect(ENV, Port(success([request_row()]), success([row])))
        self.assertEqual(result["readFailureCode"], "LOG_OUTSIDE_OBSERVED_REQUEST_TRACES")

    def test_permission_failure_preserves_only_closed_code(self):
        port = Port(subprocess.CompletedProcess([], 1, "", "PERMISSION_DENIED private text"))
        result = MODULE.collect(ENV, port)
        self.assertEqual(result["readFailureCode"], "PERMISSION_DENIED")
        self.assertNotIn("private text", json.dumps(result))

    def test_invalid_trace_never_becomes_a_second_query(self):
        result = MODULE.collect(ENV, Port(success([request_row(trace='invalid" OR true')])))
        self.assertEqual(result["readFailureCode"], "INVALID_LOG_TRACE")
        self.assertEqual(result["queryCount"], 1)

    def test_no_matching_requests_is_not_a_repair_or_pass_claim(self):
        result = MODULE.collect(ENV, Port(success([])))
        self.assertEqual(result["readStatus"], "no-matching-request-logs")
        self.assertEqual(result["requests"], [])
        self.assertNotIn("success", result)

    def test_malformed_and_oversized_responses_fail_closed(self):
        for text, code in [("not json", "MALFORMED_LOGGING_RESPONSE"),
                           (" " * (MODULE.MAX_RESPONSE_BYTES + 1), "LOGGING_RESPONSE_TOO_LARGE")]:
            with self.subTest(code=code):
                result = MODULE.collect(ENV, Port(subprocess.CompletedProcess([], 0, text, "")))
                self.assertEqual(result["readFailureCode"], code)

    def test_timeout_stays_unobserved_without_retry(self):
        port = Port(subprocess.TimeoutExpired([], 90))
        result = MODULE.collect(ENV, port)
        self.assertEqual(result["readFailureCode"], "LOGGING_READ_TIMEOUT")
        self.assertEqual(len(port.calls), 1)

    def test_a_full_page_is_explicitly_incomplete(self):
        result = MODULE.collect(ENV, Port(success([request_row()] * MODULE.REQUEST_LIMIT)))
        self.assertEqual(result["readFailureCode"], "LOGGING_RESULT_LIMIT_REACHED")


if __name__ == "__main__":
    unittest.main()
