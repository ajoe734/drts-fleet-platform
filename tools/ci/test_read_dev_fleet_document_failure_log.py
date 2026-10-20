"""Pure controlled Logging ports: no subprocess, credentials, or product calls."""
import importlib.util
import json
from pathlib import Path
import re
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
FLEET_SERVICE = "drts-dev-fleet-partner-portal-web"
FLEET_REVISION = "drts-dev-fleet-partner-portal-web-00128-v9z"
FLEET_DOCUMENT_PATH = MODULE.DOCUMENT_PATH.replace("/api/", "/control-plane-proxy/", 1)
SESSION_PATH = "/api/auth/session"


def request_row(path=MODULE.DOCUMENT_PATH, method="PUT", trace=TRACE, *,
                service=MODULE.SERVICE, revision=MODULE.REVISION, status=500):
    return {
        "resource": {"type": "cloud_run_revision", "labels": {
            "project_id": MODULE.PROJECT, "location": MODULE.REGION,
            "service_name": service, "revision_name": revision,
        }},
        "timestamp": "2026-10-20T14:40:08.123456789Z", "severity": "ERROR",
        "trace": trace, "httpRequest": {
            "requestMethod": method,
            "requestUrl": "https://private-api.example" + path + "?objectKey=private",
            "status": status, "latency": "0.123456s",
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

    def test_foreign_route_method_and_unlisted_status_rejected(self):
        for field, value in [("requestUrl", "https://private.example/api/other"),
                             ("requestMethod", "GET"), ("status", 202)]:
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


class ActualRespondingLayerReadbackTests(unittest.TestCase):
    def test_missing_method_is_closed_without_traceback_or_second_query(self):
        row = request_row()
        del row["httpRequest"]["requestMethod"]
        row["textPayload"] = "synthetic-private-no-raw-output"
        port = Port(success([row]))
        actual = MODULE.collect(ENV, port)
        self.assertEqual(actual["readFailureCode"], "INVALID_REQUEST_METHOD")
        self.assertEqual(actual["requests"], [])
        self.assertEqual(actual["correlatedApplication"], [])
        self.assertEqual(actual["queryCount"], 1)
        self.assertEqual(len(port.calls), 1)
        output = json.dumps(actual)
        for excluded in ["Traceback", "KeyError", "synthetic-private-no-raw-output"]:
            self.assertNotIn(excluded, output)

    def test_fleet_500_and_prior_503_are_observed_without_an_api_document_500(self):
        rows = [request_row(FLEET_DOCUMENT_PATH, service=FLEET_SERVICE,
                            revision=FLEET_REVISION, status=status)
                for status in [503, 500]]
        port = Port(success(rows), success([]))
        actual = MODULE.collect(ENV, port)
        self.assertIsNone(actual["readFailureCode"])
        self.assertEqual([row["status"] for row in actual["requests"]], [503, 500])
        self.assertEqual([row["serviceRole"] for row in actual["requests"]],
                         ["fleet-web", "fleet-web"])
        self.assertEqual([row["phase"] for row in actual["requests"]],
                         ["fleet-bff-document-content", "fleet-bff-document-content"])
        self.assertEqual(actual["correlatedApplication"], [])
        self.assertEqual(len(port.calls), 2)

    def test_api_session_200_or_error_without_trace_has_no_inferred_own_link(self):
        for status in [200, 500, 503]:
            with self.subTest(status=status):
                port = Port(success([request_row(SESSION_PATH, "GET", None, status=status)]))
                actual = MODULE.collect(ENV, port)
                self.assertIsNone(actual["readFailureCode"])
                self.assertEqual(actual["requests"][0]["status"], status)
                self.assertEqual(actual["requests"][0]["serviceRole"], "api")
                self.assertEqual(actual["requests"][0]["phase"], "api-session-read")
                self.assertIsNone(actual["requests"][0]["traceFingerprint"])
                self.assertEqual(actual["correlatedApplication"], [])
                self.assertNotIn("ownRequest", actual["requests"][0])
                self.assertNotIn("success", actual)
                self.assertEqual(len(port.calls), 1)

    def test_api_document_preserves_the_four_explicitly_allowed_statuses(self):
        for status in [200, 201, 500, 503]:
            with self.subTest(status=status):
                port = Port(success([request_row(trace=None, status=status)]))
                actual = MODULE.collect(ENV, port)
                self.assertIsNone(actual["readFailureCode"])
                self.assertEqual(actual["requests"][0]["status"], status)
                self.assertEqual(actual["requests"][0]["phase"], "api-document-content")
                self.assertEqual(actual["requests"][0]["serviceRole"], "api")
                self.assertEqual(len(port.calls), 1)

    def test_each_phase_rejects_other_valid_http_statuses(self):
        variants = [
            (FLEET_DOCUMENT_PATH, "PUT", FLEET_SERVICE, FLEET_REVISION, [200, 201, 404]),
            (SESSION_PATH, "GET", MODULE.SERVICE, MODULE.REVISION, [201, 401]),
            (MODULE.REVOKE_PATH, "POST", MODULE.SERVICE, MODULE.REVISION, [200, 503]),
        ]
        for path, method, service, revision, statuses in variants:
            for status in statuses:
                with self.subTest(path=path, status=status):
                    row = request_row(path, method, service=service,
                                      revision=revision, status=status)
                    port = Port(success([row]))
                    actual = MODULE.collect(ENV, port)
                    self.assertEqual(actual["readFailureCode"], "REQUEST_OUTSIDE_FIXED_FAILURES")
                    self.assertEqual(actual["requests"], [])
                    self.assertEqual(len(port.calls), 1)

    def test_service_revision_pairs_cannot_be_cross_mixed(self):
        for service, revision in [(FLEET_SERVICE, MODULE.REVISION),
                                  (MODULE.SERVICE, FLEET_REVISION)]:
            with self.subTest(service=service):
                row = request_row(FLEET_DOCUMENT_PATH, service=service, revision=revision)
                actual = MODULE.collect(ENV, Port(success([row])))
                self.assertEqual(actual["readFailureCode"], "LOG_OUTSIDE_FIXED_RESOURCE")

    def test_allowed_resource_cannot_borrow_the_other_resources_route(self):
        for row in [request_row(FLEET_DOCUMENT_PATH),
                    request_row(SESSION_PATH, "GET", service=FLEET_SERVICE,
                                revision=FLEET_REVISION)]:
            with self.subTest(row=row["httpRequest"]["requestMethod"]):
                actual = MODULE.collect(ENV, Port(success([row])))
                self.assertEqual(actual["readFailureCode"], "REQUEST_OUTSIDE_FIXED_FAILURES")

    def test_real_observed_trace_can_correlate_between_only_the_two_fixed_resources(self):
        application = request_row()
        del application["httpRequest"]
        application["jsonPayload"] = {"error": {"name": "DatabaseError", "code": "57P01"}}
        request = request_row(FLEET_DOCUMENT_PATH, service=FLEET_SERVICE,
                              revision=FLEET_REVISION)
        port = Port(success([request]), success([application]))
        actual = MODULE.collect(ENV, port)
        self.assertIsNone(actual["readFailureCode"])
        self.assertEqual(actual["requests"][0]["serviceRole"], "fleet-web")
        self.assertEqual(actual["correlatedApplication"][0]["serviceRole"], "api")
        self.assertEqual(actual["correlatedApplication"][0]["phase"],
                         "observed-trace-application")
        self.assertEqual(actual["correlatedApplication"][0]["errorCodes"], ["57P01"])
        self.assertEqual(actual["requests"][0]["traceFingerprint"],
                         actual["correlatedApplication"][0]["traceFingerprint"])
        self.assertEqual(len(port.calls), 2)
        self.assertIn(TRACE, port.calls[1][0][3])
        self.assertIn(FLEET_REVISION, port.calls[1][0][3])
        self.assertIn(MODULE.REVISION, port.calls[1][0][3])

    def test_same_window_does_not_admit_an_unobserved_correlation_trace(self):
        application = request_row(trace=TRACE[:-1] + "c")
        del application["httpRequest"]
        request = request_row(FLEET_DOCUMENT_PATH, service=FLEET_SERVICE,
                              revision=FLEET_REVISION)
        actual = MODULE.collect(ENV, Port(success([request]), success([application])))
        self.assertEqual(actual["readFailureCode"], "LOG_OUTSIDE_OBSERVED_REQUEST_TRACES")
        self.assertEqual(actual["correlatedApplication"], [])

    def test_fleet_payload_and_identity_and_full_url_remain_unprojected(self):
        marker = "synthetic-private-not-a-token"
        row = request_row(FLEET_DOCUMENT_PATH, trace=None, service=FLEET_SERVICE,
                          revision=FLEET_REVISION)
        row["jsonPayload"] = {"error": {"message": marker}, "body": marker,
                              "headers": {"Authorization": marker}, "passengerId": marker}
        row["textPayload"] = marker
        actual = MODULE.collect(ENV, Port(success([row])))
        self.assertIsNone(actual["readFailureCode"])
        output = json.dumps(actual)
        for excluded in [marker, "objectKey", "private-api.example", TRACE]:
            self.assertNotIn(excluded, output)

    def test_correlated_full_page_is_incomplete_and_never_retried(self):
        application = request_row()
        del application["httpRequest"]
        port = Port(success([request_row()]),
                    success([application] * MODULE.CORRELATED_LIMIT))
        actual = MODULE.collect(ENV, port)
        self.assertEqual(actual["readFailureCode"], "LOGGING_RESULT_LIMIT_REACHED")
        self.assertEqual(len(port.calls), 2)
        self.assertEqual(actual["queryCount"], 2)

    def test_v2_resource_inventory_is_explicit_without_relabeling_old_v1(self):
        actual = MODULE.collect(ENV, Port(success([])))
        self.assertEqual(actual["schema"], "dev-fleet-document-failure-readback-v2")
        self.assertEqual(actual["resources"], [
            {"serviceRole": "api", "service": MODULE.SERVICE, "revision": MODULE.REVISION},
            {"serviceRole": "fleet-web", "service": FLEET_SERVICE, "revision": FLEET_REVISION},
        ])
        self.assertNotIn("service", actual)
        self.assertNotIn("revision", actual)

    def test_request_query_has_only_fixed_resource_route_method_status_branches(self):
        port = Port(success([]))
        actual = MODULE.collect(ENV, port)
        self.assertIsNone(actual["readFailureCode"])
        query = port.calls[0][0][3]
        self.assertIn(FLEET_REVISION, query)
        self.assertIn(MODULE.REVISION, query)
        patterns = [json.loads(value) for value in re.findall(
            r'httpRequest\.requestUrl=~("(?:\\.|[^"\\])*")', query)]
        self.assertEqual(len(patterns), 4)
        for path in [FLEET_DOCUMENT_PATH, SESSION_PATH, MODULE.DOCUMENT_PATH, MODULE.REVOKE_PATH]:
            url = "https://synthetic.example" + path
            self.assertTrue(any(re.search(pattern, url) for pattern in patterns))
            self.assertTrue(any(re.search(pattern, url + "?objectKey=synthetic")
                                for pattern in patterns))
            self.assertFalse(any(re.search(pattern, url + "/foreign") for pattern in patterns))
        self.assertIn('httpRequest.requestMethod="GET"', query)
        self.assertIn('httpRequest.status=200', query)
        self.assertIn('httpRequest.status=201', query)
        self.assertIn('httpRequest.status=503', query)
        self.assertEqual(len(port.calls), 1)


if __name__ == "__main__":
    unittest.main()
