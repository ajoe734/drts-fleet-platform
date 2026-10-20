#!/usr/bin/env python3
"""Read the original failure's fixed responding layers, without replaying.

The fixed diagnostic source is distinct from the failed product source. Raw
Logging responses stay in memory. The artifact contains only a closed projection;
no log message, URL query, header, body, identity, or credential is persisted.
"""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
from urllib.parse import urlsplit

PROJECT = "drts-dev-devcc-20260825"
REGION = "us-central1"
SERVICE = "drts-dev-api"
REVISION = "drts-dev-api-00134-mkr"
FLEET_SERVICE = "drts-dev-fleet-partner-portal-web"
FLEET_REVISION = "drts-dev-fleet-partner-portal-web-00128-v9z"
RESOURCES = {
    "api": (SERVICE, REVISION),
    "fleet-web": (FLEET_SERVICE, FLEET_REVISION),
}
FAILED_SOURCE_SHA = "109f0f8ee19f2811897843a0420f4f92f2a03882"
START = "2026-10-20T14:40:00Z"
END = "2026-10-20T14:40:20Z"
DOCUMENT_PATH = (
    "/api/fleet-partner/supply-submissions/"
    "f6d03058-661a-44c9-b4f1-a32749e40a44/documents/content"
)
REVOKE_PATH = "/api/auth/sessions/revoke"
SESSION_PATH = "/api/auth/session"
FLEET_DOCUMENT_PATH = DOCUMENT_PATH.replace("/api/", "/control-plane-proxy/", 1)
# A row must match one complete resource/method/path/status branch. In
# particular a Fleet error does not establish an API document error, and a
# successful same-window session read does not establish the failed caller.
REQUEST_BRANCHES = (
    ("fleet-web", "PUT", FLEET_DOCUMENT_PATH, (500, 503),
     "fleet-document-content", "fleet-bff-document-content"),
    ("api", "GET", SESSION_PATH, (200, 500, 503),
     "api-session-read", "api-session-read"),
    ("api", "PUT", DOCUMENT_PATH, (200, 201, 500, 503),
     "fleet-document-content", "api-document-content"),
    ("api", "POST", REVOKE_PATH, (500,),
     "own-partner-session-revoke", "own-partner-session-revoke"),
)
REQUEST_LIMIT = 40
CORRELATED_LIMIT = 100
MAX_RESPONSE_BYTES = 2 * 1024 * 1024
TRACE = re.compile(r"projects/" + re.escape(PROJECT) + r"/traces/[a-f0-9]{32}")
SEVERITIES = {
    "DEFAULT", "DEBUG", "INFO", "NOTICE", "WARNING", "ERROR",
    "CRITICAL", "ALERT", "EMERGENCY",
}
ERROR_CLASSES = {
    "Error", "TypeError", "SyntaxError", "RangeError", "ApiRequestError",
    "DatabaseError", "AbortError",
}
ERROR_CODES = {
    "INTERNAL_SERVER_ERROR", "DOCUMENT_STORAGE_UNAVAILABLE",
    "DOCUMENT_SCANNER_UNAVAILABLE", "DOCUMENT_CONTENT_MISMATCH",
    "DOCUMENT_SCAN_REJECTED", "UPLOAD_URL_INVALID", "FLEET_SCOPE_DENIED",
    "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EPIPE",
    "ERR_STREAM_PREMATURE_CLOSE", "ERR_HTTP_HEADERS_SENT", "UND_ERR_SOCKET",
    "57P01", "53300", "08001", "08003", "08006", "40001", "40P01",
    "42P01", "23505",
}
READ_FAILURES = {
    "PERMISSION_DENIED", "UNAUTHENTICATED", "NOT_FOUND",
    "ACCESS_TOKEN_SCOPE_INSUFFICIENT", "SERVICE_DISABLED",
}


class DiagnosticFailure(Exception):
    """Only a fixed safe code may cross the diagnostic boundary."""


def require(condition, code):
    if not condition:
        raise DiagnosticFailure(code)


def instant(value):
    require(isinstance(value, str) and len(value) <= 40, "INVALID_LOG_TIMESTAMP")
    try:
        parsed = datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))
        require(parsed.utcoffset() == datetime.timedelta(), "INVALID_LOG_TIMESTAMP")
        return parsed
    except (ValueError, TypeError):
        raise DiagnosticFailure("INVALID_LOG_TIMESTAMP") from None


def resource_query(role):
    service, revision = RESOURCES[role]
    return (f'resource.labels.service_name="{service}" '
            f'AND resource.labels.revision_name="{revision}"')


def scope_query():
    resources = " OR ".join(f"({resource_query(role)})" for role in RESOURCES)
    return (
        'resource.type="cloud_run_revision" '
        f'AND resource.labels.project_id="{PROJECT}" '
        f'AND resource.labels.location="{REGION}" '
        f'AND ({resources}) '
        f'AND timestamp>="{START}" AND timestamp<="{END}"'
    )


def request_query():
    # The host is not an authority selector: the exact resource/revision is.
    # Every path is anchored; the file objectKey query is never projected.
    branches = []
    for role, method, path, statuses, _route, _phase in REQUEST_BRANCHES:
        pattern = "^https?://[^/]+" + re.escape(path) + r"(\?|$)"
        status = " OR ".join(f"httpRequest.status={value}" for value in statuses)
        branches.append(
            f'({resource_query(role)} AND httpRequest.requestMethod="{method}" '
            f'AND httpRequest.requestUrl=~{json.dumps(pattern)} AND ({status}))'
        )
    return scope_query() + " AND (" + " OR ".join(branches) + ")"


def query_rows(query, limit, runner):
    command = [
        "gcloud", "logging", "read", query, "--project", PROJECT,
        "--order=asc", "--limit", str(limit), "--format=json", "--quiet",
    ]
    try:
        result = runner(command, capture_output=True, text=True, timeout=90)
    except subprocess.TimeoutExpired:
        raise DiagnosticFailure("LOGGING_READ_TIMEOUT") from None
    except OSError:
        raise DiagnosticFailure("LOGGING_TOOL_UNAVAILABLE") from None
    if result.returncode:
        codes = sorted(code for code in READ_FAILURES if code in result.stderr)
        raise DiagnosticFailure(codes[0] if codes else "LOGGING_READ_FAILED")
    require(len(result.stdout.encode("utf-8")) <= MAX_RESPONSE_BYTES,
            "LOGGING_RESPONSE_TOO_LARGE")
    try:
        rows = json.loads(result.stdout)
    except (json.JSONDecodeError, TypeError):
        raise DiagnosticFailure("MALFORMED_LOGGING_RESPONSE") from None
    require(isinstance(rows, list) and len(rows) <= limit, "INVALID_LOGGING_ROWS")
    # A full page does not prove that the original window was completely read.
    require(len(rows) < limit, "LOGGING_RESULT_LIMIT_REACHED")
    return rows


def check_row(row):
    require(isinstance(row, dict), "INVALID_LOG_ROW")
    resource = row.get("resource")
    require(isinstance(resource, dict), "INVALID_LOG_RESOURCE")
    labels = resource.get("labels")
    role = next((name for name, (service, revision) in RESOURCES.items()
                 if isinstance(labels, dict)
                 and labels.get("service_name") == service
                 and labels.get("revision_name") == revision), None)
    require(
        resource.get("type") == "cloud_run_revision"
        and isinstance(labels, dict)
        and labels.get("project_id") == PROJECT
        and labels.get("location") == REGION
        and role is not None,
        "LOG_OUTSIDE_FIXED_RESOURCE",
    )
    timestamp = row.get("timestamp")
    require(instant(START) <= instant(timestamp) <= instant(END),
            "LOG_OUTSIDE_FIXED_WINDOW")
    trace = row.get("trace")
    require(trace is None or (isinstance(trace, str) and TRACE.fullmatch(trace)),
            "INVALID_LOG_TRACE")
    severity = row.get("severity")
    return {
        "serviceRole": role,
        "timestamp": timestamp,
        "severity": severity if isinstance(severity, str) and severity in SEVERITIES else "UNOBSERVED",
        "traceFingerprint": hashlib.sha256(trace.encode()).hexdigest() if trace else None,
    }, trace


def safe_error_facts(row):
    # Only exact structured error fields are classified. A code-like token in
    # a body/message is not evidence that this was the thrown exception.
    payload = row.get("jsonPayload")
    payload = payload if isinstance(payload, dict) else {}
    error = payload.get("error")
    error = error if isinstance(error, dict) else {}
    exception = payload.get("exception")
    exception = exception if isinstance(exception, dict) else {}
    classes = [error.get("name"), error.get("class"), exception.get("name"),
               exception.get("class"), payload.get("errorClass")]
    codes = [error.get("code"), exception.get("code"), payload.get("code")]
    return {
        "errorClasses": sorted({name for name in classes
                                if isinstance(name, str) and name in ERROR_CLASSES}),
        "errorCodes": sorted({code for code in codes
                              if isinstance(code, str) and code in ERROR_CODES}),
    }


def project_request(row):
    safe, trace = check_row(row)
    request = row.get("httpRequest")
    require(isinstance(request, dict), "MISSING_REQUEST_METADATA")
    require(isinstance(request.get("requestUrl"), str), "INVALID_REQUEST_URL")
    require(isinstance(request.get("requestMethod"), str), "INVALID_REQUEST_METHOD")
    try:
        url = urlsplit(request.get("requestUrl", ""))
        require(url.scheme in {"http", "https"} and bool(url.hostname)
                and url.username is None and url.password is None
                and not url.fragment, "INVALID_REQUEST_URL")
    except (TypeError, ValueError):
        raise DiagnosticFailure("INVALID_REQUEST_URL") from None
    branch = next((item for item in REQUEST_BRANCHES
                   if item[0] == safe["serviceRole"]
                   and item[1] == request["requestMethod"] and item[2] == url.path), None)
    require(branch is not None and type(request.get("status")) is int
            and request["status"] in branch[3], "REQUEST_OUTSIDE_FIXED_FAILURES")
    safe.update({"route": branch[4], "phase": branch[5],
                 "method": request["requestMethod"], "status": request["status"]})
    latency = request.get("latency")
    safe["latency"] = latency if isinstance(latency, str) and re.fullmatch(
        r"\d{1,4}(?:\.\d{1,9})?s", latency) else None
    safe.update(safe_error_facts(row))
    return safe, trace


def collect(environ, runner=subprocess.run):
    document = {
        "schema": "dev-fleet-document-failure-readback-v2",
        "observedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "failedSourceSha": FAILED_SOURCE_SHA, "project": PROJECT, "region": REGION,
        "resources": [{"serviceRole": role, "service": service, "revision": revision}
                      for role, (service, revision) in RESOURCES.items()],
        "start": START, "end": END,
        "definitionSha": None, "readStatus": "unobserved", "readFailureCode": None,
        "requests": [], "correlatedApplication": [], "queryCount": 0,
        "qualification": (
            "Fixed original failure logs only. No replay, product mutation, "
            "deployment, repair, or full-journey success is implied. "
            "HTTP 200/201 and same-window session reads do not establish the "
            "failed caller. Missing traces leave request association unobserved."
        ),
    }
    try:
        definition = environ.get("EXPECTED_DEFINITION_SHA", "")
        require(re.fullmatch(r"[a-f0-9]{40}", definition)
                and definition == environ.get("GITHUB_SHA"),
                "IMMUTABLE_DEFINITION_MISMATCH")
        require(environ.get("DEV_GCP_PROJECT_ID") == PROJECT
                and environ.get("DEV_GCP_REGION") == REGION, "DEV_TARGET_MISMATCH")
        document["definitionSha"] = definition
        document["queryCount"] += 1
        requests = query_rows(request_query(), REQUEST_LIMIT, runner)
        traces = set()
        for row in requests:
            safe, trace = project_request(row)
            document["requests"].append(safe)
            if trace:
                traces.add(trace)
        if traces:
            trace_filter = " OR ".join(f'trace="{trace}"' for trace in sorted(traces))
            document["queryCount"] += 1
            correlated = query_rows(
                scope_query() + f" AND ({trace_filter})", CORRELATED_LIMIT, runner,
            )
            for row in correlated:
                safe, trace = check_row(row)
                require(trace in traces, "LOG_OUTSIDE_OBSERVED_REQUEST_TRACES")
                if isinstance(row.get("httpRequest"), dict):
                    # Keep request rows only in their original closed projection.
                    project_request(row)
                    continue
                safe.update(safe_error_facts(row))
                safe["phase"] = "observed-trace-application"
                document["correlatedApplication"].append(safe)
        document["readStatus"] = (
            "request-metadata-observed" if requests else "no-matching-request-logs"
        )
    except DiagnosticFailure as error:
        document["readFailureCode"] = str(error)
    return document


# This is a separate historical profile. None of the Fleet V2 constants or
# default collector above are widened to include this later request.
ADMIN_PROFILE = "admin-root-87ea-b1b"
ADMIN_SOURCE_SHA = "b1bfc05f064663cef01baf3272e6898e04b34549"
ADMIN_SERVICE = "drts-dev-platform-admin-web"
ADMIN_REVISION = "drts-dev-platform-admin-web-00129-8x4"
ADMIN_START = "2026-10-20T20:08:30Z"
ADMIN_END = "2026-10-20T20:08:50Z"
ADMIN_REQUEST_LOG = f"projects/{PROJECT}/logs/run.googleapis.com%2Frequests"
ADMIN_STDERR_LOG = f"projects/{PROJECT}/logs/run.googleapis.com%2Fstderr"
# Exact Error lines from this historical Source only; never copy their text or
# a dynamic verifier suffix into evidence. An unrecognized Next log is unknown.
ADMIN_SIGNATURE_SOURCE = (
    ADMIN_SOURCE_SHA + ":packages/control-plane-auth/src/index.ts"
)
ADMIN_EXCEPTION_SIGNATURES = {
    "Control-plane strict IAP mode requires a valid x-goog-iap-jwt-assertion header.":
        "CONTROL_PLANE_ASSERTION_REQUIRED",
    "Control-plane strict IAP mode requires a verified user email in assertion.":
        "CONTROL_PLANE_VERIFIED_EMAIL_REQUIRED",
    "Control-plane IAP is enabled; a verified x-goog-iap-jwt-assertion is required and no default identity is applied.":
        "CONTROL_PLANE_VERIFIED_ASSERTION_REQUIRED",
    "Control-plane authenticated user email is unavailable.":
        "CONTROL_PLANE_EMAIL_UNAVAILABLE",
}


def admin_scope_query():
    return (
        'resource.type="cloud_run_revision" '
        f'AND resource.labels.project_id="{PROJECT}" '
        f'AND resource.labels.location="{REGION}" '
        f'AND resource.labels.service_name="{ADMIN_SERVICE}" '
        f'AND resource.labels.revision_name="{ADMIN_REVISION}" '
        f'AND timestamp>="{ADMIN_START}" AND timestamp<="{ADMIN_END}"'
    )


def admin_request_query():
    return (
        admin_scope_query() + f" AND logName={json.dumps(ADMIN_REQUEST_LOG)} "
        'AND httpRequest.requestMethod="GET" AND httpRequest.status=500 '
        'AND httpRequest.requestUrl=~"^https?://[^/?#]+/($|\\\\?)"'
    )


def check_admin_row(row, log_name):
    require(isinstance(row, dict), "INVALID_LOG_ROW")
    resource = row.get("resource")
    require(isinstance(resource, dict), "INVALID_LOG_RESOURCE")
    labels = resource.get("labels")
    require(
        resource.get("type") == "cloud_run_revision"
        and isinstance(labels, dict)
        and labels.get("project_id") == PROJECT
        and labels.get("location") == REGION
        and labels.get("service_name") == ADMIN_SERVICE
        and labels.get("revision_name") == ADMIN_REVISION,
        "LOG_OUTSIDE_FIXED_RESOURCE",
    )
    timestamp = row.get("timestamp")
    require(instant(ADMIN_START) <= instant(timestamp) <= instant(ADMIN_END),
            "LOG_OUTSIDE_FIXED_WINDOW")
    require(row.get("logName") == log_name, "LOG_OUTSIDE_FIXED_STREAM")
    trace = row.get("trace")
    require(trace is None or (isinstance(trace, str) and TRACE.fullmatch(trace)),
            "INVALID_LOG_TRACE")
    severity = row.get("severity")
    return {
        "serviceRole": "admin-web", "timestamp": timestamp,
        "severity": severity if isinstance(severity, str) and severity in SEVERITIES else "UNOBSERVED",
        "traceFingerprint": hashlib.sha256(trace.encode()).hexdigest() if trace else None,
    }, trace


def project_admin_request(row):
    safe, trace = check_admin_row(row, ADMIN_REQUEST_LOG)
    request = row.get("httpRequest")
    require(isinstance(request, dict), "MISSING_REQUEST_METADATA")
    require(isinstance(request.get("requestUrl"), str), "INVALID_REQUEST_URL")
    try:
        url = urlsplit(request["requestUrl"])
        require(url.scheme in {"http", "https"} and bool(url.hostname)
                and url.username is None and url.password is None
                and not url.fragment, "INVALID_REQUEST_URL")
    except (TypeError, ValueError):
        raise DiagnosticFailure("INVALID_REQUEST_URL") from None
    require(request.get("requestMethod") == "GET" and url.path == "/"
            and type(request.get("status")) is int and request["status"] == 500,
            "REQUEST_OUTSIDE_FIXED_FAILURES")
    latency = request.get("latency")
    safe.update({
        "route": "admin-root", "phase": "initial-admin-document",
        "method": "GET", "status": 500,
        "latency": latency if isinstance(latency, str) and re.fullmatch(
            r"\d{1,4}(?:\.\d{1,9})?s", latency) else None,
    })
    return safe, trace


def admin_error_facts(row):
    safe = safe_error_facts(row)
    text = row.get("textPayload")
    first_line = text.strip().splitlines()[0] if isinstance(text, str) and text.strip() else ""
    # Only the first exact exception line, not a code-like string in a body,
    # stack or arbitrary message. Next may prefix its Error line with this mark.
    signature = None
    for prefix in ("Error: ", "⨯ Error: "):
        if first_line.startswith(prefix):
            signature = ADMIN_EXCEPTION_SIGNATURES.get(first_line[len(prefix):])
            break
    safe["exceptionSignatures"] = [signature] if signature else []
    return safe


def collect_admin_root(environ, runner=subprocess.run):
    document = {
        "schema": "dev-admin-root-failure-readback-v1",
        "profile": ADMIN_PROFILE,
        "observedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "failedSourceSha": ADMIN_SOURCE_SHA, "project": PROJECT, "region": REGION,
        "service": ADMIN_SERVICE, "revision": ADMIN_REVISION,
        "start": ADMIN_START, "end": ADMIN_END,
        "exceptionSignatureSource": ADMIN_SIGNATURE_SOURCE,
        "definitionSha": None, "readStatus": "unobserved", "readFailureCode": None,
        "requests": [], "correlatedApplication": [], "queryCount": 0,
        "correlationStatus": "unobserved", "exceptionEvidenceStatus": "unobserved",
        "qualification": (
            "Historical Admin GET / HTTP500 only. The fixed window surrounds "
            "original step/report bounds, not a known exact request start. "
            "Trace association does not prove this caller or a unique root cause. "
            "Missing traces or unclassified stderr remain UNKNOWN. No product "
            "replay, repair, authority change or full-journey PASS is implied."
        ),
    }
    try:
        definition = environ.get("EXPECTED_DEFINITION_SHA", "")
        require(re.fullmatch(r"[a-f0-9]{40}", definition)
                and definition == environ.get("GITHUB_SHA"),
                "IMMUTABLE_DEFINITION_MISMATCH")
        require(environ.get("DEV_GCP_PROJECT_ID") == PROJECT
                and environ.get("DEV_GCP_REGION") == REGION, "DEV_TARGET_MISMATCH")
        document["definitionSha"] = definition
        document["queryCount"] += 1
        requests = query_rows(admin_request_query(), REQUEST_LIMIT, runner)
        traces = set()
        for row in requests:
            safe, trace = project_admin_request(row)
            document["requests"].append(safe)
            if trace:
                traces.add(trace)
        if traces:
            trace_filter = " OR ".join(f'trace="{trace}"' for trace in sorted(traces))
            document["queryCount"] += 1
            correlated = query_rows(
                admin_scope_query() + f" AND logName={json.dumps(ADMIN_STDERR_LOG)} "
                + f"AND ({trace_filter})", CORRELATED_LIMIT, runner,
            )
            for row in correlated:
                safe, trace = check_admin_row(row, ADMIN_STDERR_LOG)
                require(trace in traces, "LOG_OUTSIDE_OBSERVED_REQUEST_TRACES")
                safe.update(admin_error_facts(row))
                safe["phase"] = "observed-trace-admin-stderr"
                document["correlatedApplication"].append(safe)
            document["correlationStatus"] = (
                "observed-trace-stderr" if correlated else "no-matching-stderr"
            )
            if any(row["errorClasses"] or row["errorCodes"] or row["exceptionSignatures"]
                   for row in document["correlatedApplication"]):
                document["exceptionEvidenceStatus"] = "closed-classification-observed"
        document["readStatus"] = (
            "request-metadata-observed" if requests else "no-matching-request-logs"
        )
    except DiagnosticFailure as error:
        document["readFailureCode"] = str(error)
    return document


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--profile", choices=("fleet-original-v2", ADMIN_PROFILE),
                        default="fleet-original-v2")
    args = parser.parse_args()
    os.umask(0o077)
    document = (collect_admin_root(os.environ) if args.profile == ADMIN_PROFILE
                else collect(os.environ))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix(".tmp")
    temporary.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n")
    temporary.chmod(0o600)
    os.replace(temporary, args.output)
    print(json.dumps({
        "readStatus": document["readStatus"],
        "readFailureCode": document["readFailureCode"],
        "requestCount": len(document["requests"]),
    }))
    return 1 if document["readFailureCode"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
