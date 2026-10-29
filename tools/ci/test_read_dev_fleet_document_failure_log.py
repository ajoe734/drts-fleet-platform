"""Pure controlled Logging ports: no subprocess, credentials, or product calls."""
import importlib.util
import json
import os
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


# New-profile controls only; all original Fleet/Admin tests above are preserved.
INSTANCE = "synthetic-observed-instance_9"
REQUEST_REASONS = (
    ("The request was aborted because there was no available instance",
     "CLOUD_RUN_NO_AVAILABLE_INSTANCE", [500]),
    ("The request failed because the instance could not start successfully.",
     "CLOUD_RUN_INSTANCE_START_FAILED", [500]),
    ("The request failed because either the HTTP response was malformed or "
     "connection to the instance had an error.",
     "CLOUD_RUN_MALFORMED_RESPONSE_OR_INSTANCE_CONNECTION", [503]),
)


def instance_request(instance=INSTANCE, text=None, trace=TRACE):
    row = admin_request(trace)
    row["labels"] = {"instanceId": instance}
    if text is not None:
        row["textPayload"] = text
    return row


def instance_context(instance=INSTANCE, stream="stderr", trace=None):
    row = instance_request(instance, trace=trace)
    del row["httpRequest"]
    row["logName"] = MODULE.ADMIN_INSTANCE_STREAMS[stream]
    return row


class AdminObservedInstanceReadbackTests(unittest.TestCase):
    def test_all_three_exact_request_reasons_without_instance_need_one_query(self):
        for text, reason, statuses in REQUEST_REASONS:
            with self.subTest(reason=reason):
                port = Port(success([instance_request(None, text)]))
                actual = MODULE.collect_admin_root_instance(ENV, port)
                request = actual["requests"][0]
                self.assertEqual(request["requestPlatformReason"], reason)
                self.assertEqual(request["status"], 500)
                self.assertEqual(actual["requestReasonDocumentation"][reason]
                                 ["documentedHTTPStatuses"], tuple(statuses))
                self.assertIsNone(request["instanceFingerprint"])
                self.assertEqual(actual["instanceAssociationStatus"], "UNOBSERVED")
                self.assertEqual(actual["queryCount"], 1)
                self.assertEqual(len(port.calls), 1)
                self.assertNotIn(text, json.dumps(actual))

    def test_documented_503_category_never_rewrites_actual_500_or_claims_cause(self):
        actual = MODULE.collect_admin_root_instance(
            ENV, Port(success([instance_request(None, REQUEST_REASONS[2][0])]))
        )
        self.assertEqual(actual["requests"][0]["status"], 500)
        self.assertIn("documented for HTTP503", actual["qualification"])
        self.assertIn("do not identify this caller", actual["qualification"])
        self.assertNotIn("rootCause", actual)

    def test_only_first_exact_request_text_line_is_classified(self):
        text = REQUEST_REASONS[0][0]
        for candidate in [text + ".", text + " private-suffix", "prefix " + text,
                          "body\n" + text, "Error: " + text, "unknown",
                          {"message": text}, None]:
            with self.subTest(candidate=candidate):
                actual = MODULE.collect_admin_root_instance(
                    ENV, Port(success([instance_request(None, candidate)]))
                )
                self.assertEqual(actual["requests"][0]["requestPlatformReason"],
                                 "UNOBSERVED")
                self.assertEqual(actual["queryCount"], 1)

    def test_known_request_reason_allows_only_sgr_crlf_and_surrounding_whitespace(self):
        text = "\r\n\x1b[31m  " + REQUEST_REASONS[0][0] + " \x1b[0m\r\n"
        actual = MODULE.collect_admin_root_instance(
            ENV, Port(success([instance_request(None, text)]))
        )
        self.assertEqual(actual["requests"][0]["requestPlatformReason"],
                         REQUEST_REASONS[0][1])
        for prefix in ["\x1b]0;title\x07", "\x1b[2J", "\x00", "\x85"]:
            with self.subTest(prefix=prefix):
                actual = MODULE.collect_admin_root_instance(
                    ENV, Port(success([instance_request(None, prefix + REQUEST_REASONS[0][0])]))
                )
                self.assertEqual(actual["requests"][0]["requestPlatformReason"], "UNOBSERVED")

    def test_same_instance_stdout_and_stderr_are_only_context_without_trace(self):
        stdout = instance_context(stream="stdout")
        stderr = instance_context()
        stderr["textPayload"] = "\x1b[31m⨯ Error: " + next(
            iter(MODULE.ADMIN_EXCEPTION_SIGNATURES)
        ) + "\x1b[0m\n    at synthetic-stack"
        stderr["jsonPayload"] = {"error": {"name": "TypeError", "code": "ECONNRESET"}}
        port = Port(success([instance_request()]), success([stdout, stderr]))
        actual = MODULE.collect_admin_root_instance(ENV, port)
        self.assertIsNone(actual["readFailureCode"])
        self.assertEqual(actual["instanceAssociationStatus"], "same-instance-context-observed")
        context = actual["instanceContext"]
        self.assertEqual([row["containerStream"] for row in context], ["stdout", "stderr"])
        self.assertTrue(all(row["association"] == "same-instance-context-only" for row in context))
        self.assertTrue(all(row["sameObservedRequestTrace"] == "UNOBSERVED" for row in context))
        self.assertEqual(context[1]["exceptionSignatures"], ["CONTROL_PLANE_ASSERTION_REQUIRED"])
        self.assertEqual(context[1]["errorClasses"], ["TypeError"])
        self.assertEqual(context[1]["errorCodes"], ["ECONNRESET"])
        self.assertEqual(context[0]["instanceFingerprint"], actual["requests"][0]["instanceFingerprint"])
        self.assertNotIn(INSTANCE, json.dumps(actual))

    def test_exact_observed_trace_is_separate_from_same_instance_context(self):
        foreign_trace = TRACE[:-1] + "c"
        port = Port(success([instance_request()]), success([
            instance_context(trace=TRACE), instance_context(trace=foreign_trace),
        ]))
        actual = MODULE.collect_admin_root_instance(ENV, port)
        self.assertEqual([row["sameObservedRequestTrace"] for row in actual["instanceContext"]],
                         [True, False])
        self.assertTrue(all(row["association"] == "same-instance-context-only"
                            for row in actual["instanceContext"]))
        self.assertNotIn(TRACE, json.dumps(actual))
        self.assertNotIn(foreign_trace, json.dumps(actual))

    def test_missing_invalid_and_injected_instance_never_start_second_query(self):
        for value in [None, "", 1, [], {}, " a", "a ", "a\nb", "a\x00b", "é",
                      'a" OR severity="ERROR', "a/b", "a.b", "a" * 513]:
            with self.subTest(value=value):
                port = Port(success([instance_request(value)]))
                actual = MODULE.collect_admin_root_instance(ENV, port)
                self.assertEqual(actual["queryCount"], 1)
                self.assertEqual(len(port.calls), 1)
                self.assertIsNone(actual["requests"][0]["instanceFingerprint"])
        row = instance_request()
        del row["labels"]
        port = Port(success([row]))
        self.assertEqual(MODULE.collect_admin_root_instance(ENV, port)["queryCount"], 1)

    def test_valid_opaque_instance_uses_no_assumed_google_hex_width(self):
        for value in ["x", "A_-z9", "a" * 512]:
            with self.subTest(length=len(value)):
                port = Port(success([instance_request(value)]), success([instance_context(value)]))
                actual = MODULE.collect_admin_root_instance(ENV, port)
                self.assertIsNone(actual["readFailureCode"])
                self.assertEqual(actual["queryCount"], 2)
                self.assertNotEqual(actual["requests"][0]["instanceFingerprint"], value)

    def test_all_observed_candidates_are_kept_and_second_query_is_a_finite_or_set(self):
        rows = [instance_request("second"), instance_request("first"), instance_request("first")]
        port = Port(success(rows), success([instance_context("second"), instance_context("first")]))
        actual = MODULE.collect_admin_root_instance(ENV, port)
        self.assertEqual(len(actual["requests"]), 3)
        query = port.calls[1][0][3]
        self.assertEqual(re.findall(r'labels.instanceId=("[^"]*")', query),
                         [json.dumps("first"), json.dumps("second")])
        self.assertNotIn("trace=", query)
        self.assertEqual(len(port.calls), 2)

    def test_queries_keep_fixed_resource_window_stream_and_all_budgets(self):
        port = Port(success([instance_request()]), success([]))
        actual = MODULE.collect_admin_root_instance(ENV, port)
        self.assertEqual(port.calls[0][0][3], MODULE.admin_request_query())
        for index, (command, kwargs) in enumerate(port.calls):
            self.assertEqual(command[:3], ["gcloud", "logging", "read"])
            for value in [MODULE.PROJECT, MODULE.REGION, MODULE.ADMIN_SERVICE,
                          MODULE.ADMIN_REVISION, MODULE.ADMIN_START, MODULE.ADMIN_END]:
                self.assertIn(value, command[3])
            self.assertEqual(command[command.index("--limit") + 1], "40" if index == 0 else "100")
            self.assertEqual(kwargs, {"capture_output": True, "text": True, "timeout": 90})
            self.assertNotIn("--page-token", command)
        self.assertEqual(re.findall(r'logName=("[^"]*")', port.calls[1][0][3]),
                         [json.dumps(value) for value in MODULE.ADMIN_INSTANCE_STREAMS.values()])
        self.assertNotIn("varlog", port.calls[1][0][3])
        self.assertEqual(actual["instanceAssociationStatus"], "UNOBSERVED")

    def test_foreign_missing_or_injected_container_instance_is_rejected(self):
        for value in [None, "foreign", 'a" OR severity="ERROR', "", 7]:
            with self.subTest(value=value):
                port = Port(success([instance_request()]), success([instance_context(value)]))
                actual = MODULE.collect_admin_root_instance(ENV, port)
                self.assertEqual(actual["readFailureCode"], "LOG_OUTSIDE_OBSERVED_REQUEST_INSTANCES")
                self.assertEqual(actual["instanceContext"], [])
                self.assertEqual(len(port.calls), 2)

    def test_container_resource_time_stream_and_trace_are_revalidated(self):
        changes = [
            ("resource", None, "INVALID_LOG_RESOURCE"),
            ("resource", {"type": "global"}, "LOG_OUTSIDE_FIXED_RESOURCE"),
            ("timestamp", "2026-10-20T20:08:51Z", "LOG_OUTSIDE_FIXED_WINDOW"),
            ("logName", MODULE.ADMIN_REQUEST_LOG, "LOG_OUTSIDE_FIXED_STREAM"),
            ("logName", f"projects/{MODULE.PROJECT}/logs/run.googleapis.com%2Fvarlog%2Fsystem",
             "LOG_OUTSIDE_FIXED_STREAM"),
            ("trace", "foreign", "INVALID_LOG_TRACE"),
        ]
        for key, value, code in changes:
            with self.subTest(key=key, value=value):
                row = instance_context()
                row[key] = value
                actual = MODULE.collect_admin_root_instance(
                    ENV, Port(success([instance_request()]), success([row]))
                )
                self.assertEqual(actual["readFailureCode"], code)
                self.assertEqual(actual["instanceAssociationStatus"], "UNOBSERVED")
        for label in ["project_id", "location", "service_name", "revision_name"]:
            with self.subTest(label=label):
                row = instance_context()
                row["resource"]["labels"][label] = "foreign"
                actual = MODULE.collect_admin_root_instance(
                    ENV, Port(success([instance_request()]), success([row]))
                )
                self.assertEqual(actual["readFailureCode"], "LOG_OUTSIDE_FIXED_RESOURCE")

    def test_new_application_classifier_never_scans_a_later_error_or_hidden_suffix(self):
        line = "Error: " + next(iter(MODULE.ADMIN_EXCEPTION_SIGNATURES))
        for text in ["body\n" + line, line + " private-tail", "prefix " + line,
                     "\x1b[2J" + line, line + "\x00private"]:
            with self.subTest(text=text):
                row = instance_context()
                row["textPayload"] = text
                actual = MODULE.collect_admin_root_instance(
                    ENV, Port(success([instance_request()]), success([row]))
                )
                self.assertEqual(actual["instanceContext"][0]["exceptionSignatures"], [])

    def test_no_requests_or_no_instance_context_is_unknown_without_fallback(self):
        for responses, count in [([success([])], 1),
                                 ([success([instance_request()]), success([])], 2)]:
            with self.subTest(count=count):
                port = Port(*responses)
                actual = MODULE.collect_admin_root_instance(ENV, port)
                self.assertEqual(actual["instanceAssociationStatus"], "UNOBSERVED")
                self.assertEqual(actual["instanceContext"], [])
                self.assertEqual(len(port.calls), count)

    def test_first_query_boundaries_errors_and_denials_never_retry_or_fallback(self):
        errors = [
            (success([instance_request()] * 40), "LOGGING_RESULT_LIMIT_REACHED"),
            (subprocess.CompletedProcess([], 0, "{}", ""), "INVALID_LOGGING_ROWS"),
            (subprocess.CompletedProcess([], 0, "[invalid", ""), "MALFORMED_LOGGING_RESPONSE"),
            (subprocess.CompletedProcess([], 0, "x" * (MODULE.MAX_RESPONSE_BYTES + 1), ""),
             "LOGGING_RESPONSE_TOO_LARGE"),
            (subprocess.TimeoutExpired("private", 90), "LOGGING_READ_TIMEOUT"),
            (OSError("private"), "LOGGING_TOOL_UNAVAILABLE"),
            (subprocess.CompletedProcess([], 1, "private", "PERMISSION_DENIED private"),
             "PERMISSION_DENIED"),
        ]
        for response, code in errors:
            with self.subTest(code=code):
                port = Port(response)
                actual = MODULE.collect_admin_root_instance(ENV, port)
                self.assertEqual(actual["readFailureCode"], code)
                self.assertEqual(actual["queryCount"], 1)
                self.assertEqual(len(port.calls), 1)
                self.assertNotIn("private", json.dumps(actual))

    def test_second_query_boundaries_errors_and_denials_never_make_a_third_read(self):
        errors = [
            (success([instance_context()] * 100), "LOGGING_RESULT_LIMIT_REACHED"),
            (subprocess.CompletedProcess([], 0, "{}", ""), "INVALID_LOGGING_ROWS"),
            (subprocess.CompletedProcess([], 0, "[invalid", ""), "MALFORMED_LOGGING_RESPONSE"),
            (subprocess.CompletedProcess([], 0, "x" * (MODULE.MAX_RESPONSE_BYTES + 1), ""),
             "LOGGING_RESPONSE_TOO_LARGE"),
            (subprocess.TimeoutExpired("private", 90), "LOGGING_READ_TIMEOUT"),
            (subprocess.CompletedProcess([], 1, "private", "PERMISSION_DENIED private"),
             "PERMISSION_DENIED"),
        ]
        for response, code in errors:
            with self.subTest(code=code):
                port = Port(success([instance_request()]), response)
                actual = MODULE.collect_admin_root_instance(ENV, port)
                self.assertEqual(actual["readFailureCode"], code)
                self.assertEqual(actual["queryCount"], 2)
                self.assertEqual(len(port.calls), 2)
                self.assertEqual(actual["instanceAssociationStatus"], "UNOBSERVED")
                self.assertNotIn("private", json.dumps(actual))

    def test_maximum_nonfull_responses_remain_bounded_without_discarding_candidates(self):
        requests = [instance_request("instance_" + str(i)) for i in range(39)]
        context = [instance_context("instance_" + str(i % 39)) for i in range(99)]
        port = Port(success(requests), success(context))
        actual = MODULE.collect_admin_root_instance(ENV, port)
        self.assertIsNone(actual["readFailureCode"])
        self.assertEqual(len(actual["requests"]), 39)
        self.assertEqual(len(actual["instanceContext"]), 99)
        self.assertEqual(len(port.calls), 2)

    def test_wrong_definition_or_target_makes_no_logging_request(self):
        for key, value in [("EXPECTED_DEFINITION_SHA", "dev"), ("GITHUB_SHA", "b" * 40),
                           ("DEV_GCP_PROJECT_ID", "foreign"), ("DEV_GCP_REGION", "foreign")]:
            with self.subTest(key=key):
                port = Port()
                actual = MODULE.collect_admin_root_instance({**ENV, key: value}, port)
                self.assertIsNotNone(actual["readFailureCode"])
                self.assertEqual(port.calls, [])

    def test_private_text_ids_headers_queries_and_traces_never_cross_cli_artifact_boundary(self):
        marker = "synthetic-private-value-not-a-credential"
        request = instance_request(marker, REQUEST_REASONS[0][0])
        request["httpRequest"]["requestUrl"] += "&token=" + marker
        row = instance_context(marker)
        row["textPayload"] = marker
        row["jsonPayload"] = {"headers": {"authorization": marker}, "body": marker}
        port = Port(success([request]), success([row]))
        with TemporaryDirectory() as directory:
            output = Path(directory) / "snapshot.json"
            stdout, stderr = StringIO(), StringIO()
            with mock.patch.dict("os.environ", ENV, clear=True), \
                    mock.patch.object(MODULE, "collect_admin_root_instance",
                                      side_effect=lambda env: MODULE_COLLECT_INSTANCE(env, port)), \
                    mock.patch("sys.argv", ["readback", "--output", str(output), "--profile",
                                            MODULE.ADMIN_INSTANCE_PROFILE]), \
                    redirect_stdout(stdout), redirect_stderr(stderr):
                self.assertEqual(MODULE.main_with_instance_profile(), 0)
            data = output.read_text() + stdout.getvalue() + stderr.getvalue()
            for value in [marker, TRACE, "private-api.example", "objectKey", "authorization"]:
                self.assertNotIn(value, data)
            self.assertEqual(output.stat().st_mode & 0o777, 0o600)
            self.assertEqual(list(Path(directory).iterdir()), [output])
            self.assertEqual(len(port.calls), 2)

    def test_new_cli_delegates_each_old_profile_to_the_unchanged_main(self):
        for args in [[], ["--profile", "fleet-original-v2"], ["--profile", MODULE.ADMIN_PROFILE]]:
            with self.subTest(args=args), \
                    mock.patch("sys.argv", ["readback", "--output", "unused", *args]), \
                    mock.patch.object(MODULE, "main", return_value=7) as legacy:
                self.assertEqual(MODULE.main_with_instance_profile(), 7)
                legacy.assert_called_once_with()


MODULE_COLLECT_INSTANCE = MODULE.collect_admin_root_instance


# Ops dashboard client-timeout profile only; every earlier class is unchanged.
OPS_INSTANCE = "synthetic-ops-instance_7"


def ops_request(status=None, trace=TRACE, instance=OPS_INSTANCE, *,
                latency="16.204000000s", timestamp="2026-10-28T07:02:40.5Z"):
    request = {"requestMethod": "GET",
               "requestUrl": "https://synthetic.example/dashboard?private=omitted"}
    if status is not None:
        request["status"] = status
    if latency is not None:
        request["latency"] = latency
    row = {
        "resource": {"type": "cloud_run_revision", "labels": {
            "project_id": MODULE.PROJECT, "location": MODULE.REGION,
            "service_name": MODULE.OPS_SERVICE,
            "revision_name": MODULE.OPS_REVISION,
        }},
        "logName": MODULE.OPS_REQUEST_LOG, "timestamp": timestamp,
        "severity": "INFO", "trace": trace, "httpRequest": request,
    }
    if instance is not None:
        row["labels"] = {"instanceId": instance}
    return row


def ops_context(stream="stderr", trace=TRACE, instance=OPS_INSTANCE):
    row = ops_request(trace=trace, instance=instance)
    del row["httpRequest"]
    row["logName"] = MODULE.OPS_CONTEXT_STREAMS[stream]
    return row


def collect_ops(port, env=ENV):
    return MODULE.collect_ops_dashboard_timeout(env, port)


class OpsDashboardTimeoutReadbackTests(unittest.TestCase):
    def test_fixed_original_target_window_route_and_provenance(self):
        self.assertEqual(MODULE.OPS_SERVICE, "drts-dev-ops-console-web")
        self.assertEqual(MODULE.OPS_REVISION, "drts-dev-ops-console-web-00159-qnh")
        self.assertEqual((MODULE.OPS_START, MODULE.OPS_END),
                         ("2026-10-28T07:01:35Z", "2026-10-28T07:03:28Z"))
        self.assertEqual((MODULE.PROJECT, MODULE.REGION),
                         ("drts-dev-devcc-20260825", "us-central1"))
        actual = collect_ops(Port(success([])))
        self.assertEqual(actual["failedSourceSha"], "8992293d0ceff8aa76a0789e582b670a521ac80f")
        self.assertEqual(actual["runtimeSha"], "40bdf7d15da3d1e81ba9aa2bac22f8cc96a12073")
        self.assertEqual(actual["definitionSha"], D)
        self.assertEqual((actual["method"], actual["path"]), ("GET", "/dashboard"))
        original = actual["originalFailure"]
        self.assertEqual((original["runId"], original["jobId"]), (40647433932, 122679411106))
        self.assertEqual(original["artifact"]["sha256"],
                         "ed84c51e00be135e0bf38c8745c636c05940970295e798c64933e359e08f722f")
        self.assertEqual(original["artifact"]["bytes"], 2549)
        client = original["clientObservation"]
        self.assertEqual((client["nativeFailureClass"], client["nativeCauseCode"],
                          client["requestAborted"], client["requestDurationMs"],
                          client["responseStatus"]),
                         ("TimeoutError", "UNKNOWN", True, 15001, None))
        self.assertNotIn("rootCause", actual)
        self.assertNotIn("success", actual)

    def test_request_query_has_no_status_clause_and_only_fixed_resource_route(self):
        port = Port(success([]))
        collect_ops(port)
        command, kwargs = port.calls[0]
        query = command[3]
        self.assertEqual(query, MODULE.ops_request_query())
        for value in [MODULE.PROJECT, MODULE.REGION, MODULE.OPS_SERVICE, MODULE.OPS_REVISION,
                      MODULE.OPS_START, MODULE.OPS_END, MODULE.OPS_REQUEST_LOG,
                      'httpRequest.requestMethod="GET"']:
            self.assertIn(value, query)
        self.assertNotIn("httpRequest.status", query)
        for foreign in [MODULE.ADMIN_REVISION, MODULE.REVISION, MODULE.FLEET_REVISION,
                        MODULE.ADMIN_START, MODULE.START]:
            self.assertNotIn(foreign, query)
        pattern = json.loads(re.search(r'httpRequest\.requestUrl=~("(?:\\.|[^"\\])*")', query)[1])
        self.assertTrue(re.search(pattern, "https://synthetic.example/dashboard"))
        self.assertTrue(re.search(pattern, "https://synthetic.example/dashboard?x=1"))
        for url in ["https://synthetic.example/dashboard/x", "https://synthetic.example/",
                    "https://synthetic.example/dashboards", "https://synthetic.example/a/dashboard"]:
            self.assertFalse(re.search(pattern, url))
        self.assertEqual(command[command.index("--limit") + 1], str(MODULE.REQUEST_LIMIT))
        self.assertEqual(kwargs, {"capture_output": True, "text": True, "timeout": 90})
        self.assertNotIn("--page-token", command)

    def test_no_records_is_distinct_unknown_without_second_query(self):
        port = Port(success([]))
        actual = collect_ops(port)
        self.assertIsNone(actual["readFailureCode"])
        self.assertEqual(actual["readStatus"], "no-matching-request-logs")
        self.assertEqual(actual["candidateStatus"], "no-matching-request-records")
        self.assertEqual(actual["correlationStatus"], "UNOBSERVED")
        self.assertEqual(len(port.calls), 1)

    def test_record_without_status_is_kept_as_no_status_not_invented_500(self):
        port = Port(success([ops_request(None, trace=None, instance=None, latency=None)]))
        actual = collect_ops(port)
        self.assertIsNone(actual["readFailureCode"])
        request = actual["requests"][0]
        self.assertIsNone(request["status"])
        self.assertEqual(request["responseObservation"], "no-status-recorded")
        self.assertEqual(request["statusClass"], "UNOBSERVED")
        self.assertEqual(request["latencyVersusClientAbort"], "UNOBSERVED")
        self.assertEqual(actual["responseObservations"],
                         {"status-recorded": 0, "no-status-recorded": 1})
        self.assertEqual(actual["candidateStatus"], "single-window-route-candidate")
        self.assertEqual(request["association"], "window-route-cohort-only")
        self.assertEqual(len(port.calls), 1)

    def test_late_200_4xx_and_5xx_are_kept_as_actual_facts(self):
        for status, klass in [(200, "2xx"), (304, "3xx"), (403, "4xx"),
                              (500, "5xx"), (504, "5xx")]:
            with self.subTest(status=status):
                port = Port(success([ops_request(status, trace=None, instance=None)]))
                actual = collect_ops(port)
                self.assertIsNone(actual["readFailureCode"])
                request = actual["requests"][0]
                self.assertEqual(request["status"], status)
                self.assertEqual(request["statusClass"], klass)
                self.assertEqual(request["responseObservation"], "status-recorded")
                self.assertEqual(request["latency"], "16.204000000s")
                self.assertEqual(request["latencyVersusClientAbort"], "at-or-above-client-abort")

    def test_server_latency_is_compared_only_when_recorded(self):
        for latency, expected in [("15.001s", "at-or-above-client-abort"),
                                  ("15.000999s", "below-client-abort"),
                                  ("0.05s", "below-client-abort"),
                                  ("15001ms", "UNOBSERVED"), (15.2, "UNOBSERVED"),
                                  ("-1s", "UNOBSERVED"), ("99999s", "UNOBSERVED")]:
            with self.subTest(latency=latency):
                actual = collect_ops(Port(success([ops_request(200, None, None, latency=latency)])))
                self.assertEqual(actual["requests"][0]["latencyVersusClientAbort"], expected)
                if expected == "UNOBSERVED":
                    self.assertIsNone(actual["requests"][0]["latency"])

    def test_invalid_status_values_fail_closed(self):
        for status in ["200", True, 0, 99, 600, 200.0, []]:
            with self.subTest(status=status):
                row = ops_request(trace=None, instance=None)
                row["httpRequest"]["status"] = status
                port = Port(success([row]))
                actual = collect_ops(port)
                self.assertEqual(actual["readFailureCode"], "INVALID_REQUEST_STATUS")
                self.assertEqual(actual["requests"], [])
                self.assertEqual(len(port.calls), 1)

    def test_multiple_candidates_are_all_kept_without_choosing_a_caller(self):
        rows = [ops_request(None, trace=TRACE, instance="first"),
                ops_request(200, trace=TRACE[:-1] + "c", instance="second",
                            timestamp="2026-10-28T07:02:59Z"),
                ops_request(200, trace=None, instance="first",
                            timestamp="2026-10-28T07:03:10Z")]
        port = Port(success(rows), success([]))
        actual = collect_ops(port)
        self.assertIsNone(actual["readFailureCode"])
        self.assertEqual(actual["candidateStatus"], "multiple-window-route-candidates")
        self.assertEqual(len(actual["requests"]), 3)
        self.assertEqual(actual["responseObservations"],
                         {"status-recorded": 2, "no-status-recorded": 1})
        self.assertTrue(all(row["association"] == "window-route-cohort-only"
                            for row in actual["requests"]))
        for row in actual["requests"]:
            self.assertNotIn("originalCaller", row)
        self.assertEqual(actual["correlationStatus"], "no-matching-context")
        query = port.calls[1][0][3]
        self.assertEqual(re.findall(r'labels.instanceId=("[^"]*")', query),
                         [json.dumps("first"), json.dumps("second")])
        self.assertEqual(re.findall(r'trace=("[^"]*")', query),
                         [json.dumps(TRACE), json.dumps(TRACE[:-1] + "c")])

    def test_second_query_uses_only_observed_trace_and_instance_on_fixed_streams(self):
        port = Port(success([ops_request(None)]), success([]))
        collect_ops(port)
        self.assertEqual(len(port.calls), 2)
        command, kwargs = port.calls[1]
        query = command[3]
        self.assertEqual(query, MODULE.ops_context_query({TRACE}, {OPS_INSTANCE}))
        self.assertTrue(query.startswith(MODULE.ops_scope_query()))
        self.assertEqual(re.findall(r'logName=("[^"]*")', query),
                         [json.dumps(value) for value in MODULE.OPS_CONTEXT_STREAMS.values()])
        self.assertNotIn(MODULE.OPS_REQUEST_LOG, query)
        self.assertNotIn("varlog", query)
        self.assertNotIn("severity", query)
        self.assertEqual(command[command.index("--limit") + 1], str(MODULE.CORRELATED_LIMIT))
        self.assertEqual(kwargs, {"capture_output": True, "text": True, "timeout": 90})

    def test_trace_and_instance_context_are_projected_with_distinct_association(self):
        traced = ops_context("stdout", trace=TRACE, instance=None)
        same_instance = ops_context("stderr", trace=None)
        same_instance["jsonPayload"] = {"error": {"name": "AbortError", "code": "ETIMEDOUT"}}
        port = Port(success([ops_request(None)]), success([traced, same_instance]))
        actual = collect_ops(port)
        self.assertIsNone(actual["readFailureCode"])
        self.assertEqual(actual["correlationStatus"], "observed-correlation-context")
        first, second = actual["context"]
        self.assertEqual((first["containerStream"], first["association"],
                          first["sameObservedRequestTrace"], first["sameObservedRequestInstance"]),
                         ("stdout", "observed-request-trace", True, False))
        self.assertEqual((second["containerStream"], second["association"],
                          second["sameObservedRequestTrace"], second["sameObservedRequestInstance"]),
                         ("stderr", "same-instance-context-only", False, True))
        self.assertEqual(second["errorClasses"], ["AbortError"])
        self.assertEqual(second["errorCodes"], ["ETIMEDOUT"])
        self.assertEqual(first["traceFingerprint"], actual["requests"][0]["traceFingerprint"])
        self.assertEqual(second["instanceFingerprint"], actual["requests"][0]["instanceFingerprint"])
        self.assertNotIn("exceptionSignatures", second)

    def test_unobserved_trace_or_instance_cannot_join_context(self):
        for trace, instance in [(TRACE[:-1] + "c", "foreign"), (None, None),
                                (None, 'a" OR severity="ERROR'), (TRACE[:-1] + "d", None)]:
            with self.subTest(trace=trace, instance=instance):
                port = Port(success([ops_request(None)]),
                            success([ops_context(trace=trace, instance=instance)]))
                actual = collect_ops(port)
                self.assertEqual(actual["readFailureCode"],
                                 "LOG_OUTSIDE_OBSERVED_REQUEST_CORRELATION")
                self.assertEqual(actual["context"], [])
                self.assertEqual(actual["correlationStatus"], "UNOBSERVED")
                self.assertEqual(len(port.calls), 2)

    def test_missing_or_injected_request_instance_never_creates_a_query_key(self):
        for value in [None, "", 1, " a", "a\nb", 'a" OR severity="ERROR', "a/b", "a" * 513]:
            with self.subTest(value=value):
                port = Port(success([ops_request(None, trace=None, instance=value)]))
                actual = collect_ops(port)
                self.assertIsNone(actual["readFailureCode"])
                self.assertIsNone(actual["requests"][0]["instanceFingerprint"])
                self.assertEqual(actual["queryCount"], 1)
                self.assertEqual(len(port.calls), 1)

    def test_invalid_request_trace_fails_closed_before_second_query(self):
        for trace in ["", "projects/foreign/traces/" + "b" * 32, "b" * 32, [],
                      'x" OR true']:
            with self.subTest(trace=trace):
                port = Port(success([ops_request(None, trace=trace)]))
                actual = collect_ops(port)
                self.assertEqual(actual["readFailureCode"], "INVALID_LOG_TRACE")
                self.assertEqual(len(port.calls), 1)

    def test_context_query_rejects_unvalidated_keys(self):
        for traces, instances in [(set(), set()), ({"foreign"}, set()),
                                  (set(), {'a" OR true'}),
                                  ({f"projects/{MODULE.PROJECT}/traces/{i:032x}" for i in range(40)}, set())]:
            with self.subTest(traces=len(traces), instances=instances):
                with self.assertRaises(MODULE.DiagnosticFailure) as error:
                    MODULE.ops_context_query(traces, instances)
                self.assertEqual(str(error.exception), "INVALID_OBSERVED_CORRELATION")

    def test_wrong_definition_or_target_rejects_before_any_query(self):
        for change, code in [({"EXPECTED_DEFINITION_SHA": "dev"}, "IMMUTABLE_DEFINITION_MISMATCH"),
                             ({"EXPECTED_DEFINITION_SHA": ""}, "IMMUTABLE_DEFINITION_MISMATCH"),
                             ({"GITHUB_SHA": "c" * 40}, "IMMUTABLE_DEFINITION_MISMATCH"),
                             ({"EXPECTED_DEFINITION_SHA": MODULE.OPS_DEFINITION_SHA},
                              "IMMUTABLE_DEFINITION_MISMATCH"),
                             ({"DEV_GCP_PROJECT_ID": "nodal-alloy-503700-s3"}, "DEV_TARGET_MISMATCH"),
                             ({"DEV_GCP_REGION": "asia-east1"}, "DEV_TARGET_MISMATCH")]:
            with self.subTest(change=change):
                port = Port()
                actual = collect_ops(port, {**ENV, **change})
                self.assertEqual(actual["readFailureCode"], code)
                self.assertIsNone(actual["definitionSha"])
                self.assertEqual(port.calls, [])

    def test_foreign_resource_revision_and_crossed_services_reject(self):
        for field, value in [("project_id", "foreign"), ("location", "foreign"),
                             ("service_name", MODULE.ADMIN_SERVICE),
                             ("revision_name", "drts-dev-ops-console-web-00160-abc")]:
            with self.subTest(field=field):
                row = ops_request(None)
                row["resource"]["labels"][field] = value
                port = Port(success([row]))
                self.assertEqual(collect_ops(port)["readFailureCode"], "LOG_OUTSIDE_FIXED_RESOURCE")
                self.assertEqual(len(port.calls), 1)
        row = ops_request(None)
        row["resource"]["type"] = "global"
        self.assertEqual(collect_ops(Port(success([row])))["readFailureCode"],
                         "LOG_OUTSIDE_FIXED_RESOURCE")

    def test_wrong_window_or_non_utc_timestamp_rejects(self):
        for timestamp, code in [("2026-10-28T07:01:34.999Z", "LOG_OUTSIDE_FIXED_WINDOW"),
                                ("2026-10-28T07:03:28.001Z", "LOG_OUTSIDE_FIXED_WINDOW"),
                                ("2026-10-20T20:08:40Z", "LOG_OUTSIDE_FIXED_WINDOW"),
                                ("2026-10-28T15:02:00+08:00", "INVALID_LOG_TIMESTAMP"),
                                ("not-a-time", "INVALID_LOG_TIMESTAMP"), (None, "INVALID_LOG_TIMESTAMP")]:
            with self.subTest(timestamp=timestamp):
                actual = collect_ops(Port(success([ops_request(None, timestamp=timestamp)])))
                self.assertEqual(actual["readFailureCode"], code)
        for boundary in [MODULE.OPS_START, MODULE.OPS_END]:
            actual = collect_ops(Port(success([ops_request(None, trace=None, instance=None,
                                                           timestamp=boundary)])))
            self.assertIsNone(actual["readFailureCode"])

    def test_foreign_method_path_and_stream_reject(self):
        changes = [{"requestMethod": value} for value in ["POST", "HEAD", None, 1]]
        changes += [{"requestUrl": "https://synthetic.example" + path}
                    for path in ["/", "/dashboard/", "/dashboards", "/api/dashboard",
                                 "/control-plane-proxy/auth/token"]]
        for change in changes:
            with self.subTest(change=change):
                row = ops_request(None)
                row["httpRequest"].update(change)
                port = Port(success([row]))
                self.assertEqual(collect_ops(port)["readFailureCode"], "REQUEST_OUTSIDE_FIXED_ROUTE")
                self.assertEqual(len(port.calls), 1)
        for stream in [None, MODULE.OPS_CONTEXT_STREAMS["stderr"],
                       "projects/foreign/logs/run.googleapis.com%2Frequests"]:
            with self.subTest(stream=stream):
                row = ops_request(None)
                row["logName"] = stream
                self.assertEqual(collect_ops(Port(success([row])))["readFailureCode"],
                                 "LOG_OUTSIDE_FIXED_STREAM")

    def test_context_rows_revalidate_resource_window_stream_and_trace(self):
        changes = [("resource", None, "INVALID_LOG_RESOURCE"),
                   ("timestamp", "2026-10-28T07:03:29Z", "LOG_OUTSIDE_FIXED_WINDOW"),
                   ("logName", MODULE.OPS_REQUEST_LOG, "LOG_OUTSIDE_FIXED_STREAM"),
                   ("logName", f"projects/{MODULE.PROJECT}/logs/run.googleapis.com%2Fvarlog%2Fsystem",
                    "LOG_OUTSIDE_FIXED_STREAM"),
                   ("trace", "foreign", "INVALID_LOG_TRACE")]
        for key, value, code in changes:
            with self.subTest(key=key, value=value):
                row = ops_context()
                row[key] = value
                actual = collect_ops(Port(success([ops_request(None)]), success([row])))
                self.assertEqual(actual["readFailureCode"], code)
                self.assertEqual(actual["context"], [])
                self.assertEqual(len(actual["requests"]), 1)

    def test_malformed_rows_and_urls_fail_closed(self):
        bad = [None, [], {}, {"resource": []}]
        for request in [None, [], "GET /dashboard"]:
            row = ops_request(None)
            row["httpRequest"] = request
            bad.append(row)
        for row in bad:
            with self.subTest(row=row):
                self.assertIsNotNone(collect_ops(Port(success([row])))["readFailureCode"])
        for url in [None, 12, "file:///dashboard", "https://", "https://[bad/dashboard",
                    "https://user:private@synthetic.example/dashboard",
                    "https://synthetic.example/dashboard#private"]:
            with self.subTest(url=url):
                row = ops_request(None)
                row["httpRequest"]["requestUrl"] = url
                self.assertEqual(collect_ops(Port(success([row])))["readFailureCode"],
                                 "INVALID_REQUEST_URL")

    def test_request_reason_reuses_only_exact_closed_categories(self):
        text, reason, _statuses = REQUEST_REASONS[0]
        for payload, expected in [(text, reason), (text + " private-tail", "UNOBSERVED"),
                                  ("unknown private text", "UNOBSERVED")]:
            with self.subTest(expected=expected):
                row = ops_request(None, trace=None, instance=None)
                row["textPayload"] = payload
                actual = collect_ops(Port(success([row])))
                self.assertEqual(actual["requests"][0]["requestPlatformReason"], expected)
                self.assertIsNone(actual["requests"][0]["status"])
                self.assertNotIn("private", json.dumps(actual["requests"]))

    def test_first_query_failures_are_concrete_unavailable_without_retry(self):
        errors = [
            (success([ops_request(None)] * MODULE.REQUEST_LIMIT), "LOGGING_RESULT_LIMIT_REACHED"),
            (subprocess.CompletedProcess([], 0, "{}", ""), "INVALID_LOGGING_ROWS"),
            (subprocess.CompletedProcess([], 0, "[invalid", ""), "MALFORMED_LOGGING_RESPONSE"),
            (subprocess.CompletedProcess([], 0, "x" * (MODULE.MAX_RESPONSE_BYTES + 1), ""),
             "LOGGING_RESPONSE_TOO_LARGE"),
            (subprocess.TimeoutExpired("private", 90), "LOGGING_READ_TIMEOUT"),
            (OSError("private"), "LOGGING_TOOL_UNAVAILABLE"),
            (subprocess.CompletedProcess([], 1, "private", "PERMISSION_DENIED private"),
             "PERMISSION_DENIED"),
            (subprocess.CompletedProcess([], 1, "", "UNAUTHENTICATED private expired"),
             "UNAUTHENTICATED"),
            (subprocess.CompletedProcess([], 1, "", "private other failure"), "LOGGING_READ_FAILED"),
        ]
        for response, code in errors:
            with self.subTest(code=code):
                port = Port(response)
                actual = collect_ops(port)
                self.assertEqual(actual["readFailureCode"], code)
                self.assertEqual(actual["readStatus"], "unobserved")
                self.assertEqual(actual["candidateStatus"], "unobserved")
                self.assertEqual(actual["queryCount"], 1)
                self.assertEqual(len(port.calls), 1)
                self.assertNotIn("private", json.dumps(actual))

    def test_second_query_failures_keep_request_facts_without_third_read(self):
        errors = [
            (success([ops_context()] * MODULE.CORRELATED_LIMIT), "LOGGING_RESULT_LIMIT_REACHED"),
            (subprocess.CompletedProcess([], 0, "[invalid", ""), "MALFORMED_LOGGING_RESPONSE"),
            (subprocess.CompletedProcess([], 0, "x" * (MODULE.MAX_RESPONSE_BYTES + 1), ""),
             "LOGGING_RESPONSE_TOO_LARGE"),
            (subprocess.TimeoutExpired("private", 90), "LOGGING_READ_TIMEOUT"),
            (subprocess.CompletedProcess([], 1, "", "PERMISSION_DENIED private"), "PERMISSION_DENIED"),
        ]
        for response, code in errors:
            with self.subTest(code=code):
                port = Port(success([ops_request(504)]), response)
                actual = collect_ops(port)
                self.assertEqual(actual["readFailureCode"], code)
                self.assertEqual(actual["requests"][0]["status"], 504)
                self.assertEqual(actual["candidateStatus"], "single-window-route-candidate")
                self.assertEqual(actual["correlationStatus"], "UNOBSERVED")
                self.assertEqual(actual["readStatus"], "unobserved")
                self.assertEqual(len(port.calls), 2)
                self.assertNotIn("private", json.dumps(actual))

    def test_maximum_nonfull_pages_keep_every_candidate_and_context(self):
        requests = [ops_request(200, trace=None, instance=f"instance_{i}") for i in range(39)]
        context = [ops_context(trace=None, instance=f"instance_{i % 39}") for i in range(99)]
        port = Port(success(requests), success(context))
        actual = collect_ops(port)
        self.assertIsNone(actual["readFailureCode"])
        self.assertEqual(len(actual["requests"]), 39)
        self.assertEqual(len(actual["context"]), 99)
        self.assertEqual(len(port.calls), 2)

    def test_hostile_payloads_ids_and_traces_never_cross_cli_artifact_boundary(self):
        marker = "synthetic-private-value-not-a-credential"
        request = ops_request(200, instance=marker)
        request["httpRequest"]["requestUrl"] += "&token=" + marker
        request["httpRequest"]["userAgent"] = marker
        request["httpRequest"]["remoteIp"] = marker
        request["textPayload"] = marker
        context = ops_context(instance=marker)
        context["textPayload"] = "Error: " + marker + "\n    at private-stack"
        context["jsonPayload"] = {"error": {"name": marker, "code": marker, "message": marker},
                                  "headers": {"authorization": "Bearer " + marker},
                                  "email": marker, "token": marker, "body": marker,
                                  "stack": marker}
        port = Port(success([request]), success([context]))
        with TemporaryDirectory() as directory:
            output = Path(directory) / "snapshot.json"
            stdout, stderr = StringIO(), StringIO()
            with mock.patch.dict("os.environ", ENV, clear=True), \
                    mock.patch.object(MODULE, "collect_ops_dashboard_timeout",
                                      side_effect=lambda env: MODULE_COLLECT_OPS(env, port)), \
                    mock.patch("sys.argv", ["readback", "--output", str(output), "--profile",
                                            MODULE.OPS_DASHBOARD_PROFILE]), \
                    redirect_stdout(stdout), redirect_stderr(stderr):
                self.assertEqual(MODULE.main_with_ops_dashboard_profile(), 0)
            data = output.read_text() + stdout.getvalue() + stderr.getvalue()
            for value in [marker, TRACE, "synthetic.example", "private=", "token=",
                          "Bearer", "authorization", "private-stack"]:
                self.assertNotIn(value, data)
            self.assertEqual(output.stat().st_mode & 0o777, 0o600)
            self.assertEqual(list(Path(directory).iterdir()), [output])
            self.assertEqual(json.loads(stdout.getvalue()),
                             {"readStatus": "request-metadata-observed",
                              "readFailureCode": None, "requestCount": 1})
            self.assertEqual(len(port.calls), 2)

    def test_cli_failure_preserves_artifact_and_nonzero_exit(self):
        port = Port(subprocess.CompletedProcess([], 1, "", "PERMISSION_DENIED private"))
        with TemporaryDirectory() as directory:
            output = Path(directory) / "nested" / "snapshot.json"
            stdout = StringIO()
            with mock.patch.dict("os.environ", ENV, clear=True), \
                    mock.patch.object(MODULE, "collect_ops_dashboard_timeout",
                                      side_effect=lambda env: MODULE_COLLECT_OPS(env, port)), \
                    mock.patch("sys.argv", ["readback", "--output", str(output), "--profile",
                                            MODULE.OPS_DASHBOARD_PROFILE]), \
                    redirect_stdout(stdout):
                self.assertEqual(MODULE.main_with_ops_dashboard_profile(), 1)
            self.assertEqual(json.loads(output.read_text())["readFailureCode"], "PERMISSION_DENIED")
            self.assertNotIn("private", output.read_text() + stdout.getvalue())

    def test_new_cli_delegates_every_legacy_profile_unchanged(self):
        for args in [[], ["--profile", "fleet-original-v2"], ["--profile", MODULE.ADMIN_PROFILE],
                     ["--profile", MODULE.ADMIN_INSTANCE_PROFILE]]:
            with self.subTest(args=args), \
                    mock.patch("sys.argv", ["readback", "--output", "unused", *args]), \
                    mock.patch.object(MODULE, "main_with_instance_profile", return_value=7) as legacy, \
                    mock.patch.object(MODULE, "collect_ops_dashboard_timeout") as ops:
                self.assertEqual(MODULE.main_with_ops_dashboard_profile(), 7)
                legacy.assert_called_once_with()
                ops.assert_not_called()

    def test_legacy_entrypoints_lack_the_new_profile_and_foreign_profiles_reject(self):
        for entry in [MODULE.main, MODULE.main_with_instance_profile]:
            with self.subTest(entry=entry.__name__), \
                    mock.patch("sys.argv", ["readback", "--output", "unused", "--profile",
                                            MODULE.OPS_DASHBOARD_PROFILE]), \
                    mock.patch.object(MODULE, "collect_ops_dashboard_timeout") as ops, \
                    redirect_stderr(StringIO()):
                with self.assertRaises(SystemExit) as error:
                    entry()
                self.assertEqual(error.exception.code, 2)
                ops.assert_not_called()
        for profile in ["foreign", "ops-dashboard", "--filter"]:
            with self.subTest(profile=profile), \
                    mock.patch("sys.argv", ["readback", "--output", "unused", "--profile", profile]), \
                    mock.patch.object(MODULE, "collect_ops_dashboard_timeout") as ops, \
                    redirect_stderr(StringIO()):
                with self.assertRaises(SystemExit) as error:
                    MODULE.main_with_ops_dashboard_profile()
                self.assertEqual(error.exception.code, 2)
                ops.assert_not_called()

    def test_script_entrypoint_is_the_new_dispatcher(self):
        self.assertIn("raise SystemExit(main_with_ops_dashboard_profile())",
                      SOURCE.read_text().rsplit("\n", 3)[-2])

    def test_original_fleet_job_selects_exactly_one_profile_before_authentication(self):
        workflow = (ROOT / ".github/workflows/ci-integ.yml").read_text()
        self.assertIn("      readonly_ops_dashboard_timeout_failure:\n"
                      "        description: \"Read only the fixed original Ops GET /dashboard "
                      "client-timeout window records; never replays\"\n"
                      "        required: false\n        default: false\n        type: boolean\n",
                      workflow)
        jobs = re.findall(r"^  ([a-z0-9-]+):\n", workflow.split("\njobs:\n", 1)[1], re.M)
        self.assertEqual(sorted(job for job in jobs if "readback" in job), [
            "readonly-admin-root-failure-readback",
            "readonly-admin-root-instance-failure-readback",
            "readonly-api-startup-readback",
            "readonly-fleet-document-failure-readback",
        ])
        self.assertNotIn("readonly-ops-dashboard-timeout-failure-readback", workflow)
        self.assertEqual(workflow.count("--profile ops-dashboard-timeout-40647433932-v1"), 1)
        job = workflow.split("  readonly-fleet-document-failure-readback:\n", 1)[1]
        job = job.split("\n\n", 1)[0]
        # The original condition is kept verbatim; the new input only adds an OR.
        self.assertIn("    if: (github.event_name == 'workflow_dispatch' && "
                      "inputs.readonly_fleet_failure == true) || "
                      "(github.event_name == 'workflow_dispatch' && "
                      "inputs.readonly_ops_dashboard_timeout_failure == true)\n", job)
        self.assertIn("timeout-minutes: 10", job)
        for absent in ["pnpm", "playwright", "curl", "gcloud run", "owned_referral_business"]:
            self.assertNotIn(absent, job)
        steps = []
        for block in ("\n" + job.split("\n    steps:\n", 1)[1]).split("\n      - ")[1:]:
            name = re.search(r"(?:^|\n\s+)(?:name|uses): (.+)", block)[1]
            condition = re.search(r"\n        if: (.+)", block)
            steps.append((name, condition[1] if condition else None, block))
        names = [name for name, _condition, _block in steps]
        auth = names.index("Authenticate existing deploy identity for read-only request diagnostics")
        for before in ["Validate immutable diagnostic definition and dev target before authentication",
                       "Select exactly one fixed readback profile before authentication",
                       "actions/checkout@v4", "Verify actual diagnostic checkout"]:
            self.assertLess(names.index(before), auth)
        selector = steps[names.index("Select exactly one fixed readback profile before authentication")][2]
        script = selector.split("run: |\n", 1)[1]
        script = "\n".join(line[10:] for line in script.splitlines())

        def evaluate(condition, inputs):
            expression = condition.replace("github.event_name == 'workflow_dispatch'", "True")
            expression = expression.replace("always()", "True")
            expression = re.sub(r"inputs\.([a-z_]+) (==|!=) true",
                                lambda m: f"({inputs.get(m[1], False)} {m[2]} True)", expression)
            expression = expression.replace("&&", " and ").replace("||", " or ")
            self.assertTrue(re.fullmatch(r"[()TrueFals=! andor]+", expression), expression)
            return eval(expression, {"__builtins__": {}})

        job_condition = re.search(r"\n    if: (.+)", "\n" + job)[1]
        fleet_run = ("python3 operations/verification/read-dev-fleet-document-failure-log.py \\\n"
                     "            --output .artifacts/dev-fleet-document-failure-readback/snapshot.json")
        ops_run = ("python3 operations/verification/read-dev-fleet-document-failure-log.py\n"
                   "          --profile ops-dashboard-timeout-40647433932-v1\n"
                   "          --output .artifacts/dev-ops-dashboard-timeout-failure-readback/snapshot.json")
        fleet_artifact = ("name: dev-fleet-document-failure-readback-${{ github.run_id }}\n"
                          "          path: |\n"
                          "            .artifacts/dev-fleet-document-failure-readback/snapshot.json\n"
                          "            .artifacts/dev-fleet-document-failure-readback/fleet-root-timeout.json")
        ops_artifact = ("name: dev-ops-dashboard-timeout-failure-readback-${{ github.run_id }}\n"
                        "          path: .artifacts/dev-ops-dashboard-timeout-failure-readback/snapshot.json")
        cases = [((False, False), False, None), ((True, False), True, "fleet"),
                 ((False, True), True, "ops"), ((True, True), True, "rejected")]
        for (fleet, ops), runs, expected in cases:
            with self.subTest(fleet=fleet, ops=ops):
                inputs = {"readonly_fleet_failure": fleet,
                          "readonly_ops_dashboard_timeout_failure": ops}
                self.assertEqual(evaluate(job_condition, inputs), runs)
                if not runs:
                    continue
                selected = subprocess.run(
                    ["bash", "-c", script], capture_output=True, text=True, timeout=10,
                    env={"PATH": "/usr/bin:/bin", "FLEET_SELECTED": str(fleet).lower(),
                         "OPS_SELECTED": str(ops).lower()},
                )
                self.assertEqual(selected.returncode == 0, expected != "rejected")
                failed, executed = False, []
                for name, condition, block in steps:
                    always = condition is not None and "always()" in condition
                    if (failed and not always) or (condition and not evaluate(condition, inputs)):
                        continue
                    executed.append(block)
                    if name.startswith("Select exactly one") and selected.returncode:
                        failed = True
                reads = [block for block in executed if "read-dev-fleet-document-failure-log.py" in block]
                uploads = [block for block in executed if "upload-artifact" in block]
                if expected == "rejected":
                    self.assertEqual(reads, [])
                    self.assertFalse(any("google-github-actions/auth" in block for block in executed))
                    continue
                self.assertEqual(len(reads), 1)
                self.assertEqual(len(uploads), 1)
                if expected == "fleet":
                    self.assertIn(fleet_run, reads[0])
                    self.assertEqual(reads[0].count("--profile"), 1)
                    self.assertIn("--profile fleet-root-timeout-40891070459-v1", reads[0])
                    self.assertIn(fleet_artifact, uploads[0])
                else:
                    self.assertIn(ops_run, reads[0])
                    self.assertIn(ops_artifact, uploads[0])
                self.assertIn("if-no-files-found: error", uploads[0])
                self.assertIn("retention-days: 14", uploads[0])


MODULE_COLLECT_OPS = MODULE.collect_ops_dashboard_timeout


def fleet_root_request(status=None, trace=TRACE, instance="synthetic-fleet-instance"):
    row = ops_request(status, trace, instance, timestamp="2026-10-29T14:31:01Z")
    row["resource"]["labels"].update(
        service_name=FLEET_SERVICE,
        revision_name="drts-dev-fleet-partner-portal-web-00162-x96",
    )
    row["httpRequest"]["requestUrl"] = "https://synthetic.example/?private=omitted"
    return row


def fleet_root_context(trace=TRACE, instance="synthetic-fleet-instance", stream="stderr"):
    row = fleet_root_request(trace=trace, instance=instance)
    del row["httpRequest"]
    row["logName"] = MODULE.OPS_CONTEXT_STREAMS[stream]
    return row


def collect_fleet_root(port, env=ENV):
    return MODULE.collect_fleet_root_timeout(env, port)


class FleetRootTimeoutReadbackTests(unittest.TestCase):
    def test_real_cli_accepts_fixed_current_profile_without_product_or_cloud(self):
        # Only gcloud is replaced. Exercise the actual script/argparse/collector,
        # projection, safe artifact writer and exit status in a fresh process.
        with TemporaryDirectory() as directory:
            directory = Path(directory)
            gcloud = directory / "gcloud"
            gcloud.write_text('#!/bin/sh\nprintf \'[]\\n\'\n')
            gcloud.chmod(0o700)
            output = directory / "snapshot.json"
            result = subprocess.run(
                ["python3", str(SOURCE), "--profile", "fleet-root-timeout-40891070459-v1",
                 "--output", str(output)],
                env={**os.environ, **ENV, "PATH": str(directory) + os.pathsep + os.environ["PATH"]},
                capture_output=True, text=True, timeout=10,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            actual = json.loads(output.read_text())
            self.assertEqual(actual["readStatus"], "no-matching-request-logs")
            self.assertEqual(actual["correlationStatus"], "UNOBSERVED")
            self.assertEqual(actual["definitionSha"], D)
            self.assertEqual(output.stat().st_mode & 0o777, 0o600)


    def test_current_cohort_outcomes_and_fixed_query_are_not_old_fleet_or_ops(self):
        rows = [fleet_root_request(status, trace=None, instance=None)
                for status in [200, 304, 403, 499, 500, 503, 504, None]]
        port = Port(success(rows))
        actual = collect_fleet_root(port)
        self.assertIsNone(actual["readFailureCode"])
        self.assertEqual([row["status"] for row in actual["requests"]],
                         [200, 304, 403, 499, 500, 503, 504, None])
        self.assertEqual(actual["candidateStatus"], "multiple-window-route-candidates")
        self.assertEqual(actual["responseObservations"],
                         {"status-recorded": 7, "no-status-recorded": 1})
        self.assertTrue(all(row["serviceRole"] == "fleet-web" and row["route"] == "fleet-root"
                            and row["phase"] == "authenticated-fleet-root-before-first-supply"
                            and row["association"] == "window-route-cohort-only"
                            for row in actual["requests"]))
        command, kwargs = port.calls[0]
        query = command[3]
        for fixed in ["drts-dev-devcc-20260825", "us-central1", FLEET_SERVICE,
                      "drts-dev-fleet-partner-portal-web-00162-x96",
                      "2026-10-29T14:30:45Z", "2026-10-29T14:31:30Z",
                      MODULE.ADMIN_REQUEST_LOG, 'httpRequest.requestMethod="GET"']:
            self.assertIn(fixed, query)
        for absent in ["httpRequest.status", MODULE.FLEET_REVISION, MODULE.OPS_REVISION,
                       MODULE.REVISION, MODULE.ADMIN_REVISION, MODULE.START, MODULE.OPS_START]:
            self.assertNotIn(absent, query)
        pattern = json.loads(re.search(r'httpRequest\.requestUrl=~("(?:\\.|[^"\\])*")', query)[1])
        for url in ["https://synthetic.example/", "https://synthetic.example/?private=omitted"]:
            self.assertTrue(re.search(pattern, url))
        for path in ["", "//", "/dashboard", "/api/auth/session", "/control-plane-proxy/", "/%2f"]:
            self.assertFalse(re.search(pattern, "https://synthetic.example" + path))
        self.assertEqual(command[:3], ["gcloud", "logging", "read"])
        self.assertEqual(command[command.index("--limit") + 1], "40")
        self.assertEqual(kwargs, {"capture_output": True, "text": True, "timeout": 90})
        self.assertEqual(len(port.calls), 1)

    def test_provenance_keeps_diagnostic_failed_and_runtime_sources_distinct(self):
        actual = collect_fleet_root(Port(success([])))
        self.assertEqual(actual["schema"], "dev-fleet-root-timeout-readback-v1")
        self.assertEqual(actual["definitionSha"], D)
        self.assertEqual(actual["failedSourceSha"], "1e4c41bd16346c11bcbf3cfc1bcf4b9d238a0989")
        self.assertEqual(actual["runtimeSha"], "7796a2bebda614eb8e00f410b945532f5089d9d1")
        self.assertEqual((actual["method"], actual["path"]), ("GET", "/"))
        original = actual["originalFailure"]
        self.assertEqual((original["runId"], original["jobId"]), (40891070459, 123507711583))
        self.assertEqual(original["artifact"]["sha256"],
                         "7604dc669774a0ea14ab0da58c5e66d2725c2cc9248c4e835d91ea0665d15caa")
        self.assertEqual(original["artifact"]["bytes"], 4412)
        self.assertEqual(original["clientObservation"]["requestDurationMs"], 15001)
        self.assertIsNone(original["clientObservation"]["responseStatus"])
        self.assertEqual(actual["candidateStatus"], "no-matching-request-records")
        self.assertEqual(actual["correlationStatus"], "UNOBSERVED")
        for absent in ["rootCause", "success", "coldStart"]:
            self.assertNotIn(absent, actual)
        self.assertIn("Original raw FAIL remains FAIL", actual["qualification"])

    def test_fixed_resource_role_revision_and_window_revalidated_on_both_reads(self):
        changes = [("project_id", "foreign"), ("location", "asia-east1"),
                   ("service_name", MODULE.OPS_SERVICE), ("service_name", MODULE.SERVICE),
                   ("revision_name", MODULE.FLEET_REVISION),
                   ("revision_name", MODULE.OPS_REVISION), ("revision_name", MODULE.REVISION)]
        for context in [False, True]:
            for field, value in changes:
                with self.subTest(context=context, field=field, value=value):
                    row = fleet_root_context() if context else fleet_root_request()
                    row["resource"]["labels"][field] = value
                    port = (Port(success([fleet_root_request()]), success([row])) if context
                            else Port(success([row])))
                    self.assertEqual(collect_fleet_root(port)["readFailureCode"],
                                     "LOG_OUTSIDE_FIXED_RESOURCE")
                    self.assertEqual(len(port.calls), 2 if context else 1)
            for timestamp in ["2026-10-29T14:30:44.999Z", "2026-10-29T14:31:30.001Z",
                              MODULE.OPS_START, "2026-10-29T22:31:01+08:00", None, "invalid"]:
                with self.subTest(context=context, timestamp=timestamp):
                    row = fleet_root_context() if context else fleet_root_request()
                    row["timestamp"] = timestamp
                    port = (Port(success([fleet_root_request()]), success([row])) if context
                            else Port(success([row])))
                    self.assertIn(collect_fleet_root(port)["readFailureCode"],
                                  {"LOG_OUTSIDE_FIXED_WINDOW", "INVALID_LOG_TIMESTAMP"})
        for boundary in ["2026-10-29T14:30:45Z", "2026-10-29T14:31:30Z"]:
            row = fleet_root_request(trace=None, instance=None)
            row["timestamp"] = boundary
            self.assertIsNone(collect_fleet_root(Port(success([row])))["readFailureCode"])

    def test_wrong_method_path_stream_url_and_status_fail_closed(self):
        changes = [("requestMethod", method, "REQUEST_OUTSIDE_FIXED_ROUTE")
                   for method in [None, "HEAD", "POST", [], 1]]
        changes += [("requestUrl", "https://synthetic.example" + path, "REQUEST_OUTSIDE_FIXED_ROUTE")
                    for path in ["/dashboard", "//", "/%2f", "/api/auth/session", "/a/.."]]
        changes += [("requestUrl", url, "INVALID_REQUEST_URL")
                    for url in [None, [], "file:///", "https://", "https://[bad/",
                                "https://user:private@synthetic.example/", "https://synthetic.example/#private"]]
        changes += [("status", status, "INVALID_REQUEST_STATUS")
                    for status in [True, "200", 200.0, [], 0, 99, 600]]
        for field, value, code in changes:
            with self.subTest(field=field, value=value):
                row = fleet_root_request()
                row["httpRequest"][field] = value
                port = Port(success([row]))
                actual = collect_fleet_root(port)
                self.assertEqual(actual["readFailureCode"], code)
                self.assertEqual(actual["requests"], [])
                self.assertEqual(len(port.calls), 1)
        for context in [False, True]:
            for stream in [None, "foreign", f"projects/{MODULE.PROJECT}/logs/run.googleapis.com%2Fvarlog%2Fsystem"]:
                row = fleet_root_context() if context else fleet_root_request()
                row["logName"] = stream
                port = (Port(success([fleet_root_request()]), success([row])) if context
                        else Port(success([row])))
                self.assertEqual(collect_fleet_root(port)["readFailureCode"], "LOG_OUTSIDE_FIXED_STREAM")

    def test_latency_absence_and_no_context_never_prove_startup_or_caller(self):
        for latency, expected in [(None, "UNOBSERVED"), ("15.001s", "at-or-above-client-abort"),
                                  ("15.000999s", "below-client-abort"), ("0.2s", "below-client-abort"),
                                  ("15001ms", "UNOBSERVED"), ([], "UNOBSERVED")]:
            row = fleet_root_request(trace=None, instance=None)
            row["httpRequest"]["latency"] = latency
            row["textPayload"] = "Starting new instance. Reason: AUTOSCALING private-suffix"
            actual = collect_fleet_root(Port(success([row])))
            request = actual["requests"][0]
            self.assertEqual(request["latencyVersusClientAbort"], expected)
            self.assertIsNone(request["status"])
            self.assertEqual(request["statusClass"], "UNOBSERVED")
            self.assertEqual(request["requestPlatformReason"], "UNOBSERVED")
            self.assertEqual(actual["correlationStatus"], "UNOBSERVED")
            self.assertNotIn("coldStart", request)

    def test_context_uses_only_observed_keys_and_separates_trace_from_instance(self):
        traced = fleet_root_context(trace=TRACE, instance=None, stream="stdout")
        instanced = fleet_root_context(trace=None)
        instanced["jsonPayload"] = {"error": {"name": "AbortError", "code": "ETIMEDOUT"}}
        port = Port(success([fleet_root_request()]), success([traced, instanced]))
        actual = collect_fleet_root(port)
        self.assertIsNone(actual["readFailureCode"])
        self.assertEqual([row["association"] for row in actual["context"]],
                         ["observed-request-trace", "same-instance-context-only"])
        self.assertEqual(actual["context"][1]["errorCodes"], ["ETIMEDOUT"])
        self.assertEqual(actual["context"][0]["traceFingerprint"], actual["requests"][0]["traceFingerprint"])
        self.assertEqual(actual["context"][1]["instanceFingerprint"], actual["requests"][0]["instanceFingerprint"])
        query = port.calls[1][0][3]
        for fixed in [FLEET_SERVICE, "00162-x96", "2026-10-29T14:30:45Z", "2026-10-29T14:31:30Z"]:
            self.assertIn(fixed, query)
        self.assertEqual(re.findall(r'trace=("[^"%]*")', query), [json.dumps(TRACE)])
        self.assertEqual(re.findall(r'labels.instanceId=("[^"]*")', query),
                         [json.dumps("synthetic-fleet-instance")])
        self.assertEqual(re.findall(r'logName=("[^"]*")', query),
                         [json.dumps(value) for value in MODULE.OPS_CONTEXT_STREAMS.values()])
        self.assertEqual(port.calls[1][0][port.calls[1][0].index("--limit") + 1], "100")
        self.assertNotIn("--page-token", port.calls[1][0])

    def test_unobserved_or_injected_correlation_cannot_broaden_reads(self):
        for trace, instance in [(TRACE[:-1] + "c", "foreign"), (None, None),
                                (None, 'a" OR true')]:
            port = Port(success([fleet_root_request()]),
                        success([fleet_root_context(trace=trace, instance=instance)]))
            actual = collect_fleet_root(port)
            self.assertEqual(actual["readFailureCode"], "LOG_OUTSIDE_OBSERVED_REQUEST_CORRELATION")
            self.assertEqual(actual["context"], [])
            self.assertEqual(actual["correlationStatus"], "UNOBSERVED")
        for instance in [None, "", [], 1, 'a" OR true', "a/b", "a" * 513]:
            port = Port(success([fleet_root_request(trace=None, instance=instance)]))
            actual = collect_fleet_root(port)
            self.assertIsNone(actual["readFailureCode"])
            self.assertIsNone(actual["requests"][0]["instanceFingerprint"])
            self.assertEqual(len(port.calls), 1)
        for trace in ["", [], "foreign", 'a" OR true']:
            port = Port(success([fleet_root_request(trace=trace)]))
            self.assertEqual(collect_fleet_root(port)["readFailureCode"], "INVALID_LOG_TRACE")
            self.assertEqual(len(port.calls), 1)

    def test_environment_refusals_precede_any_logging(self):
        for field, value, code in [("DEV_GCP_PROJECT_ID", "nodal-alloy-503700-s3", "DEV_TARGET_MISMATCH"),
                                   ("DEV_GCP_REGION", "asia-east1", "DEV_TARGET_MISMATCH"),
                                   ("EXPECTED_DEFINITION_SHA", "dev", "IMMUTABLE_DEFINITION_MISMATCH"),
                                   ("GITHUB_SHA", MODULE.FLEET_ROOT_RUNTIME_SHA, "IMMUTABLE_DEFINITION_MISMATCH")]:
            port = Port()
            self.assertEqual(collect_fleet_root(port, {**ENV, field: value})["readFailureCode"], code)
            self.assertEqual(port.calls, [])

    def test_truncated_malformed_unavailable_and_full_pages_never_retry(self):
        failures = [
            (subprocess.CompletedProcess([], 0, "[truncated", ""), "MALFORMED_LOGGING_RESPONSE"),
            (success({}), "INVALID_LOGGING_ROWS"),
            (subprocess.CompletedProcess([], 0, "x" * (MODULE.MAX_RESPONSE_BYTES + 1), ""), "LOGGING_RESPONSE_TOO_LARGE"),
            (subprocess.CompletedProcess([], 1, "", "PERMISSION_DENIED private"), "PERMISSION_DENIED"),
            (subprocess.TimeoutExpired([], 90), "LOGGING_READ_TIMEOUT"),
            (OSError("private"), "LOGGING_TOOL_UNAVAILABLE"),
        ]
        for context in [False, True]:
            full = [fleet_root_context()] * 100 if context else [fleet_root_request()] * 40
            for response, code in failures + [(success(full), "LOGGING_RESULT_LIMIT_REACHED")]:
                with self.subTest(context=context, code=code):
                    port = (Port(success([fleet_root_request(200)]), response) if context else Port(response))
                    actual = collect_fleet_root(port)
                    self.assertEqual(actual["readFailureCode"], code)
                    self.assertEqual(len(port.calls), 2 if context else 1)
                    self.assertEqual(actual["readStatus"], "unobserved")
                    self.assertEqual(actual["correlationStatus"], "UNOBSERVED")
                    self.assertNotIn("private", json.dumps(actual))
                    if context:
                        self.assertEqual(actual["requests"][0]["status"], 200)
        for row in [None, [], {}, {"resource": None}]:
            self.assertIsNotNone(collect_fleet_root(Port(success([row])))["readFailureCode"])

    def test_maximum_nonfull_pages_retain_all_current_candidates(self):
        requests = [fleet_root_request(200, trace=None, instance=f"instance_{i}") for i in range(39)]
        context = [fleet_root_context(trace=None, instance=f"instance_{i % 39}") for i in range(99)]
        port = Port(success(requests), success(context))
        actual = collect_fleet_root(port)
        self.assertIsNone(actual["readFailureCode"])
        self.assertEqual((len(actual["requests"]), len(actual["context"]), len(port.calls)), (39, 99, 2))

    def test_real_cli_writes_only_closed_projection_and_no_raw_private_fields(self):
        marker = "synthetic-private-fleet-value"
        request = fleet_root_request(200, instance=marker)
        request["httpRequest"].update(headers={"Cookie": marker}, body=marker, remoteIp=marker,
                                      userAgent=marker, requestUrl="https://synthetic.example/?token=" + marker)
        request["textPayload"] = marker
        context = fleet_root_context(instance=marker)
        context["jsonPayload"] = {
            "error": {"name": "TypeError", "code": "ECONNRESET", "message": marker},
            "headers": {"Authorization": "Bearer " + marker}, "body": marker,
            "email": marker, "actorId": marker, "startupStatus": marker, "statusReason": marker,
        }
        context["textPayload"] = "Error: " + marker + " private-stack"
        with TemporaryDirectory() as directory:
            directory = Path(directory)
            fixture = directory / "fixture.json"
            fixture.write_text(json.dumps({"requests": [request], "context": [context]}))
            gcloud = directory / "gcloud"
            gcloud.write_text('#!/usr/bin/python3\nimport json, os, sys\n'
                              'with open(os.environ["READBACK_FIXTURE"]) as f: data = json.load(f)\n'
                              'print(json.dumps(data["requests" if "httpRequest.requestMethod" in sys.argv[3] else "context"]))\n')
            gcloud.chmod(0o700)
            output = directory / "snapshot.json"
            result = subprocess.run(
                ["python3", str(SOURCE), "--profile", MODULE.FLEET_ROOT_TIMEOUT_PROFILE, "--output", str(output)],
                env={**os.environ, **ENV, "READBACK_FIXTURE": str(fixture),
                     "PATH": str(directory) + os.pathsep + os.environ["PATH"]},
                capture_output=True, text=True, timeout=10,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            rendered = output.read_text() + result.stdout + result.stderr
            for excluded in [marker, TRACE, "synthetic.example", "token=", "Cookie", "Authorization", "Bearer", "private-stack"]:
                self.assertNotIn(excluded, rendered)
            actual = json.loads(output.read_text())
            self.assertEqual(actual["context"][0]["errorClasses"], ["TypeError"])
            self.assertEqual(actual["context"][0]["errorCodes"], ["ECONNRESET"])
            self.assertEqual(json.loads(result.stdout), {"readStatus": "request-metadata-observed",
                                                       "readFailureCode": None, "requestCount": 1})
            self.assertEqual(output.stat().st_mode & 0o777, 0o600)
            self.assertFalse(output.with_suffix(".tmp").exists())

    def test_workflow_runs_both_fleet_profiles_even_when_one_read_fails(self):
        workflow = (ROOT / ".github/workflows/ci-integ.yml").read_text()
        job = workflow.split("  readonly-fleet-document-failure-readback:\n", 1)[1].split("\n\n", 1)[0]
        block = job.split("      - name: Read only the fixed failure window without invoking the product\n", 1)[1]
        block = block.split("\n      - name:", 1)[0]
        script = "\n".join(line[10:] for line in block.split("run: |\n", 1)[1].splitlines())
        for original_exit, current_exit in [(0, 0), (1, 0), (0, 1), (1, 1)]:
            with self.subTest(original=original_exit, current=current_exit), TemporaryDirectory() as directory:
                directory = Path(directory)
                python = directory / "python3"
                python.write_text("#!/bin/sh\nprintf '%s\\n' \"$*\" >> \"$CALL_LOG\"\n"
                                  'case "$*" in *--profile*) exit "$CURRENT_EXIT";; *) exit "$ORIGINAL_EXIT";; esac\n')
                python.chmod(0o700)
                log = directory / "calls.log"
                result = subprocess.run(["bash", "-c", script], capture_output=True, text=True, timeout=10,
                                        env={"PATH": str(directory) + ":/usr/bin:/bin", "CALL_LOG": str(log),
                                             "ORIGINAL_EXIT": str(original_exit), "CURRENT_EXIT": str(current_exit)})
                self.assertEqual(result.returncode, int(bool(original_exit or current_exit)))
                calls = log.read_text().splitlines()
                self.assertEqual(len(calls), 2)
                self.assertNotIn("--profile", calls[0])
                self.assertIn("--profile fleet-root-timeout-40891070459-v1", calls[1])
                self.assertIn("/snapshot.json", calls[0])
                self.assertIn("/fleet-root-timeout.json", calls[1])


if __name__ == "__main__":
    unittest.main()
