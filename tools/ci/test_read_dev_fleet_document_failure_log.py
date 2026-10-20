"""Pure controlled Logging ports: no subprocess, credentials, or product calls."""
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import unittest
from contextlib import redirect_stdout, redirect_stderr
from io import StringIO
from tempfile import TemporaryDirectory
from unittest import mock

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


def admin_request(trace=TRACE):
    return {
        "resource": {"type": "cloud_run_revision", "labels": {
            "project_id": MODULE.PROJECT, "location": MODULE.REGION,
            "service_name": MODULE.ADMIN_SERVICE,
            "revision_name": MODULE.ADMIN_REVISION,
        }},
        "logName": MODULE.ADMIN_REQUEST_LOG,
        "timestamp": "2026-10-20T20:08:48.0901908Z",
        "severity": "ERROR", "trace": trace,
        "httpRequest": {"requestMethod": "GET", "status": 500,
                        "requestUrl": "https://synthetic.example/?private=omitted",
                        "latency": "0.123456789s"},
    }


def admin_stderr(trace=TRACE):
    row = admin_request(trace)
    del row["httpRequest"]
    row["logName"] = MODULE.ADMIN_STDERR_LOG
    row["jsonPayload"] = {"error": {"name": "TypeError", "code": "ECONNRESET"}}
    return row


class AdminRootFailureReadbackTests(unittest.TestCase):
    def test_exact_request_and_observed_trace_stderr_have_closed_projection(self):
        port = Port(success([admin_request()]), success([admin_stderr()]))
        actual = MODULE.collect_admin_root(ENV, port)
        self.assertIsNone(actual["readFailureCode"])
        self.assertEqual(actual["readStatus"], "request-metadata-observed")
        self.assertEqual(actual["correlationStatus"], "observed-trace-stderr")
        self.assertEqual(actual["exceptionEvidenceStatus"], "closed-classification-observed")
        self.assertEqual(actual["failedSourceSha"], "b1bfc05f064663cef01baf3272e6898e04b34549")
        self.assertEqual(actual["definitionSha"], D)
        self.assertEqual(actual["requests"][0]["status"], 500)
        self.assertEqual(actual["requests"][0]["route"], "admin-root")
        self.assertEqual(actual["requests"][0]["latency"], "0.123456789s")
        self.assertEqual(actual["correlatedApplication"][0]["errorClasses"], ["TypeError"])
        self.assertEqual(actual["correlatedApplication"][0]["errorCodes"], ["ECONNRESET"])
        self.assertEqual(actual["requests"][0]["traceFingerprint"],
                         actual["correlatedApplication"][0]["traceFingerprint"])
        self.assertEqual(actual["queryCount"], 2)
        self.assertNotIn(TRACE, json.dumps(actual))

    def test_queries_are_fixed_requests_then_same_trace_stderr_not_fleet(self):
        port = Port(success([admin_request()]), success([]))
        MODULE.collect_admin_root(ENV, port)
        self.assertEqual(len(port.calls), 2)
        for index, (command, kwargs) in enumerate(port.calls):
            self.assertEqual(command[:3], ["gcloud", "logging", "read"])
            query = command[3]
            for fixed in [MODULE.ADMIN_REVISION, MODULE.ADMIN_START, MODULE.ADMIN_END,
                          MODULE.PROJECT, MODULE.REGION, MODULE.ADMIN_SERVICE]:
                self.assertIn(fixed, query)
            self.assertNotIn(MODULE.FLEET_REVISION, query)
            self.assertNotIn(MODULE.START, query)
            self.assertEqual(kwargs, {"capture_output": True, "text": True, "timeout": 90})
            self.assertEqual(command[command.index("--limit") + 1], "40" if index == 0 else "100")
            self.assertNotIn("--page-token", command)
        query = port.calls[0][0][3]
        self.assertIn(MODULE.ADMIN_REQUEST_LOG, query)
        self.assertIn('httpRequest.requestMethod="GET"', query)
        self.assertIn('httpRequest.status=500', query)
        pattern = json.loads(re.search(r'httpRequest\.requestUrl=~("(?:\\.|[^"\\])*")', query)[1])
        self.assertTrue(re.search(pattern, "https://synthetic.example/"))
        self.assertTrue(re.search(pattern, "https://synthetic.example/?private=omitted"))
        self.assertFalse(re.search(pattern, "https://synthetic.example/foreign"))
        self.assertIn(MODULE.ADMIN_STDERR_LOG, port.calls[1][0][3])
        self.assertIn(TRACE, port.calls[1][0][3])
        self.assertNotIn('severity>=', port.calls[1][0][3])

    def test_unfrozen_definition_or_wrong_target_never_queries(self):
        for change, failure in [
            ({"EXPECTED_DEFINITION_SHA": "dev"}, "IMMUTABLE_DEFINITION_MISMATCH"),
            ({"GITHUB_SHA": "c" * 40}, "IMMUTABLE_DEFINITION_MISMATCH"),
            ({"DEV_GCP_PROJECT_ID": "foreign"}, "DEV_TARGET_MISMATCH"),
            ({"DEV_GCP_REGION": "foreign"}, "DEV_TARGET_MISMATCH"),
        ]:
            with self.subTest(change=change):
                port = Port()
                self.assertEqual(MODULE.collect_admin_root({**ENV, **change}, port)["readFailureCode"], failure)
                self.assertEqual(port.calls, [])

    def test_foreign_and_crossed_resources_reject_before_correlation(self):
        for field in ["project_id", "location", "service_name", "revision_name"]:
            with self.subTest(field=field):
                row = admin_request()
                row["resource"]["labels"][field] = "foreign"
                port = Port(success([row]))
                actual = MODULE.collect_admin_root(ENV, port)
                self.assertEqual(actual["readFailureCode"], "LOG_OUTSIDE_FIXED_RESOURCE")
                self.assertEqual(len(port.calls), 1)
        row = admin_request()
        row["resource"]["labels"].update(service_name=MODULE.SERVICE, revision_name=MODULE.REVISION)
        self.assertEqual(MODULE.collect_admin_root(ENV, Port(success([row])))["readFailureCode"],
                         "LOG_OUTSIDE_FIXED_RESOURCE")

    def test_wrong_window_or_non_utc_timestamp_rejects(self):
        for timestamp in ["2026-10-20T20:08:29.999Z", "2026-10-20T20:08:50.001Z",
                          "2026-10-20T20:08:40+08:00", "not-a-time", None]:
            with self.subTest(timestamp=timestamp):
                row = admin_request()
                row["timestamp"] = timestamp
                actual = MODULE.collect_admin_root(ENV, Port(success([row])))
                self.assertIn(actual["readFailureCode"], {"LOG_OUTSIDE_FIXED_WINDOW", "INVALID_LOG_TIMESTAMP"})

    def test_missing_or_foreign_request_method_route_status_rejects(self):
        changes = [{"requestMethod": value} for value in [None, "POST", 12]]
        changes += [{"status": value} for value in [200, 403, 503, "500", True, None]]
        changes += [{"requestUrl": "https://synthetic.example" + path}
                    for path in ["/dashboard", "/control-plane-proxy/auth/token", "/api/auth/session"]]
        for change in changes:
            with self.subTest(change=change):
                row = admin_request()
                row["httpRequest"].update(change)
                port = Port(success([row]))
                self.assertEqual(MODULE.collect_admin_root(ENV, port)["readFailureCode"],
                                 "REQUEST_OUTSIDE_FIXED_FAILURES")
                self.assertEqual(len(port.calls), 1)

    def test_malformed_rows_and_request_metadata_fail_closed(self):
        bad_rows = [None, [], {}, {"resource": []}]
        row = admin_request()
        row["resource"]["labels"] = None
        bad_rows.append(row)
        for request in [None, [], "GET /"]:
            row = admin_request()
            row["httpRequest"] = request
            bad_rows.append(row)
        for row in bad_rows:
            with self.subTest(row=row):
                actual = MODULE.collect_admin_root(ENV, Port(success([row])))
                self.assertIsNotNone(actual["readFailureCode"])
                self.assertEqual(actual["correlationStatus"], "unobserved")

    def test_malformed_credentialed_or_fragment_urls_reject(self):
        for url in [None, 12, "file:///", "https://", "https://[bad/",
                    "https://user:private@synthetic.example/", "https://synthetic.example/#private"]:
            with self.subTest(url=url):
                row = admin_request()
                row["httpRequest"]["requestUrl"] = url
                actual = MODULE.collect_admin_root(ENV, Port(success([row])))
                self.assertEqual(actual["readFailureCode"], "INVALID_REQUEST_URL")

    def test_missing_request_trace_has_no_stderr_fallback(self):
        row = admin_request(None)
        port = Port(success([row]))
        actual = MODULE.collect_admin_root(ENV, port)
        self.assertIsNone(actual["readFailureCode"])
        self.assertEqual(actual["requests"][0]["status"], 500)
        self.assertIsNone(actual["requests"][0]["traceFingerprint"])
        self.assertEqual(actual["correlationStatus"], "unobserved")
        self.assertEqual(actual["exceptionEvidenceStatus"], "unobserved")
        self.assertEqual(len(port.calls), 1)

    def test_invalid_request_trace_does_not_reach_second_query(self):
        for trace in ["", "projects/foreign/traces/" + "b" * 32, "b" * 32, [], "private"]:
            with self.subTest(trace=trace):
                port = Port(success([admin_request(trace)]))
                self.assertEqual(MODULE.collect_admin_root(ENV, port)["readFailureCode"], "INVALID_LOG_TRACE")
                self.assertEqual(len(port.calls), 1)

    def test_only_observed_trace_can_join_application_stderr(self):
        for trace in [None, f"projects/{MODULE.PROJECT}/traces/" + "c" * 32]:
            with self.subTest(trace=trace):
                port = Port(success([admin_request()]), success([admin_stderr(trace)]))
                actual = MODULE.collect_admin_root(ENV, port)
                self.assertEqual(actual["readFailureCode"], "LOG_OUTSIDE_OBSERVED_REQUEST_TRACES")
                self.assertEqual(actual["correlatedApplication"], [])
                self.assertEqual(len(port.calls), 2)

    def test_wrong_log_stream_or_correlated_resource_never_projects(self):
        for stream in [None, MODULE.ADMIN_STDERR_LOG, "projects/foreign/logs/run.googleapis.com%2Frequests"]:
            with self.subTest(requestStream=stream):
                row = admin_request()
                row["logName"] = stream
                self.assertEqual(MODULE.collect_admin_root(ENV, Port(success([row])))["readFailureCode"],
                                 "LOG_OUTSIDE_FIXED_STREAM")
        for field, value in [("logName", MODULE.ADMIN_REQUEST_LOG),
                             ("logName", f"projects/{MODULE.PROJECT}/logs/run.googleapis.com%2Fstdout"),
                             ("resource", admin_request()["resource"] | {"type": "foreign"}),
                             ("timestamp", MODULE.START)]:
            with self.subTest(stderrField=field):
                row = admin_stderr()
                row[field] = value
                actual = MODULE.collect_admin_root(ENV, Port(success([admin_request()]), success([row])))
                self.assertIsNotNone(actual["readFailureCode"])
                self.assertEqual(actual["correlatedApplication"], [])

    def test_source_pinned_exact_error_line_maps_only_to_closed_enum(self):
        row = admin_stderr()
        row.pop("jsonPayload")
        row["textPayload"] = "⨯ Error: Control-plane authenticated user email is unavailable.\n    at private-stack"
        actual = MODULE.collect_admin_root(ENV, Port(success([admin_request()]), success([row])))
        self.assertEqual(actual["correlatedApplication"][0]["exceptionSignatures"],
                         ["CONTROL_PLANE_EMAIL_UNAVAILABLE"])
        self.assertEqual(actual["exceptionSignatureSource"], MODULE.ADMIN_SOURCE_SHA + ":packages/control-plane-auth/src/index.ts")
        self.assertNotIn("private-stack", json.dumps(actual))
        self.assertNotIn("authenticated user email", json.dumps(actual))

    def test_unstructured_or_lookalike_messages_are_not_exception_proof(self):
        for text in ["Unknown private failure", "payload says Error: Control-plane authenticated user email is unavailable.",
                     "arbitrary first line\nError: Control-plane authenticated user email is unavailable.",
                     "Error: Control-plane authenticated user email is unavailable. private-suffix"]:
            with self.subTest(text=text):
                row = admin_stderr()
                row.pop("jsonPayload")
                row["textPayload"] = text
                actual = MODULE.collect_admin_root(ENV, Port(success([admin_request()]), success([row])))
                self.assertEqual(actual["correlatedApplication"][0]["exceptionSignatures"], [])
                self.assertEqual(actual["exceptionEvidenceStatus"], "unobserved")

    def test_credential_bearing_payloads_headers_body_and_query_never_leave_memory(self):
        marker = "synthetic-private-secret-value"
        request = admin_request()
        request["httpRequest"]["requestUrl"] += marker
        app = admin_stderr()
        app["textPayload"] = "Error: " + marker
        app["jsonPayload"] = {"error": {"name": marker, "code": marker, "message": marker},
                              "headers": {"authorization": "Bearer " + marker},
                              "token": marker, "body": marker, "stack": marker,
                              "email": marker, "actorId": marker}
        actual = MODULE.collect_admin_root(ENV, Port(success([request]), success([app])))
        rendered = json.dumps(actual)
        for value in [marker, TRACE, "synthetic.example", "private=", "Bearer"]:
            self.assertNotIn(value, rendered)
        self.assertEqual(actual["exceptionEvidenceStatus"], "unobserved")

    def test_empty_or_denied_read_is_unknown_without_retry(self):
        for response, code in [(success([]), None),
                               (subprocess.CompletedProcess([], 1, "", "PERMISSION_DENIED private"), "PERMISSION_DENIED"),
                               (subprocess.TimeoutExpired([], 90), "LOGGING_READ_TIMEOUT"),
                               (OSError("private"), "LOGGING_TOOL_UNAVAILABLE")]:
            with self.subTest(code=code):
                port = Port(response)
                actual = MODULE.collect_admin_root(ENV, port)
                self.assertEqual(actual["readFailureCode"], code)
                self.assertEqual(actual["exceptionEvidenceStatus"], "unobserved")
                self.assertEqual(len(port.calls), 1)
                self.assertNotIn("private", json.dumps(actual))
                if code is None:
                    self.assertEqual(actual["readStatus"], "no-matching-request-logs")

    def test_malformed_oversize_and_full_request_page_are_incomplete(self):
        for response, code in [
            (subprocess.CompletedProcess([], 0, "not-json", ""), "MALFORMED_LOGGING_RESPONSE"),
            (subprocess.CompletedProcess([], 0, "x" * (MODULE.MAX_RESPONSE_BYTES + 1), ""), "LOGGING_RESPONSE_TOO_LARGE"),
            (success({}), "INVALID_LOGGING_ROWS"),
            (success([admin_request()] * MODULE.REQUEST_LIMIT), "LOGGING_RESULT_LIMIT_REACHED"),
        ]:
            with self.subTest(code=code):
                port = Port(response)
                actual = MODULE.collect_admin_root(ENV, port)
                self.assertEqual(actual["readFailureCode"], code)
                self.assertEqual(actual["readStatus"], "unobserved")
                self.assertEqual(len(port.calls), 1)

    def test_correlated_read_failure_preserves_request_without_retry_or_pass(self):
        for response, code in [
            (success([admin_stderr()] * MODULE.CORRELATED_LIMIT), "LOGGING_RESULT_LIMIT_REACHED"),
            (subprocess.CompletedProcess([], 1, "", "UNAUTHENTICATED private"), "UNAUTHENTICATED"),
            (subprocess.TimeoutExpired([], 90), "LOGGING_READ_TIMEOUT"),
        ]:
            with self.subTest(code=code):
                port = Port(success([admin_request()]), response)
                actual = MODULE.collect_admin_root(ENV, port)
                self.assertEqual(actual["readFailureCode"], code)
                self.assertEqual(actual["requests"][0]["status"], 500)
                self.assertEqual(actual["correlationStatus"], "unobserved")
                self.assertEqual(actual["exceptionEvidenceStatus"], "unobserved")
                self.assertEqual(len(port.calls), 2)

    def test_cli_default_keeps_fleet_and_explicit_admin_writes_only_safe_summary(self):
        for profile in [None, MODULE.ADMIN_PROFILE]:
            with self.subTest(profile=profile), TemporaryDirectory() as directory:
                output = Path(directory) / "snapshot.json"
                argv = ["readback", "--output", str(output)]
                if profile:
                    argv += ["--profile", profile]
                fake = {"readStatus": "unobserved", "readFailureCode": None,
                        "requests": [], "notForConsole": "synthetic-private"}
                stdout = StringIO()
                with mock.patch("sys.argv", argv), mock.patch.object(MODULE, "collect", return_value=fake) as fleet, \
                        mock.patch.object(MODULE, "collect_admin_root", return_value=fake) as admin, redirect_stdout(stdout):
                    self.assertEqual(MODULE.main(), 0)
                (admin if profile else fleet).assert_called_once()
                (fleet if profile else admin).assert_not_called()
                self.assertEqual(output.stat().st_mode & 0o777, 0o600)
                self.assertNotIn("synthetic-private", stdout.getvalue())
                self.assertEqual(json.loads(stdout.getvalue()),
                                 {"readStatus": "unobserved", "readFailureCode": None, "requestCount": 0})

    def test_cli_has_no_arbitrary_resource_or_window_profile(self):
        with mock.patch("sys.argv", ["readback", "--output", "unused", "--profile", "foreign"]), \
                mock.patch.object(MODULE, "collect") as fleet, \
                mock.patch.object(MODULE, "collect_admin_root") as admin, redirect_stderr(StringIO()):
            with self.assertRaises(SystemExit) as error:
                MODULE.main()
        self.assertEqual(error.exception.code, 2)
        fleet.assert_not_called()
        admin.assert_not_called()


if __name__ == "__main__":
    unittest.main()
