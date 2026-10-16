#!/usr/bin/env python3
"""Read-only, fixed-target startup log readback for one failed Cloud Run revision.

Reads only the exact revision/time window recorded for the shared-dev API
startup failure. Never invokes product endpoints and never retrieves secret
values; log text that looks like a credential is redacted before it is
persisted.
"""
import argparse
import datetime
import json
import os
import re
import subprocess
from pathlib import Path

PROJECT = "drts-dev-devcc-20260825"
REGION = "us-central1"
SERVICE = "drts-dev-api"
REVISION = "drts-dev-api-00092-9j6"
START = "2026-10-16T01:07:50Z"
END = "2026-10-16T01:10:00Z"
LIMIT = 100
FAILED_SOURCE_SHA = "2aed20cee7c80fca77aeb326ab6c8b8377fee0dd"

CREDENTIAL_KEY = re.compile(
    r"(?i)((?:password|client_secret|api_key|access_token|refresh_token|"
    r"authorization|jwt_secret)\s*[=:]\s*)[^\s,;]+"
)
BEARER_OR_PEM = re.compile(r"-----BEGIN |(?i)\bBearer\s+\S+")


def require(condition, text):
    if not condition:
        raise ValueError(text)


def redact(value):
    if BEARER_OR_PEM.search(value):
        return "[credential-bearing log entry omitted]"
    return CREDENTIAL_KEY.sub(r"\1[omitted]", value)[:16000]


def entry_message(entry):
    value = entry.get("textPayload")
    if not isinstance(value, str):
        payload = entry.get("jsonPayload")
        value = payload.get("message") if isinstance(payload, dict) else None
    return redact(value) if isinstance(value, str) else None


def read_entries():
    query = (
        'resource.type="cloud_run_revision" '
        f'AND resource.labels.service_name="{SERVICE}" '
        f'AND resource.labels.revision_name="{REVISION}" '
        f'AND timestamp>="{START}" AND timestamp<="{END}"'
    )
    result = subprocess.run(
        ["gcloud", "logging", "read", query, "--project", PROJECT,
         "--limit", str(LIMIT), "--format=json", "--quiet"],
        capture_output=True, text=True, timeout=90,
    )
    if result.returncode:
        codes = sorted(set(re.findall(
            r"\b(?:PERMISSION_DENIED|UNAUTHENTICATED|NOT_FOUND|"
            r"ACCESS_TOKEN_SCOPE_INSUFFICIENT|SERVICE_DISABLED)\b",
            result.stderr,
        ))) or ["gcloud_logging_read_failed"]
        return result.returncode, codes, None
    try:
        rows = json.loads(result.stdout)
        require(isinstance(rows, list), "Logging response is not a list")
    except (json.JSONDecodeError, ValueError):
        return 1, ["malformed_logging_response"], None
    entries = []
    for row in rows:
        labels = (row.get("resource") or {}).get("labels") or {}
        require(labels.get("service_name") == SERVICE and
                 labels.get("revision_name") == REVISION,
                 "Logging row is outside the requested service/revision")
        text = entry_message(row)
        if text:
            entries.append({"timestamp": row.get("timestamp"),
                             "severity": row.get("severity"), "message": text})
    return 0, None, {"returned_rows": len(rows), "entries": entries}


def collect():
    require(os.environ.get("DEV_GCP_PROJECT_ID") == PROJECT and
            os.environ.get("DEV_GCP_REGION") == REGION, "Unexpected live target variables")
    exit_code, failure_codes, parsed = read_entries()
    document = {
        "schema": "dev-api-startup-readback-v1",
        "observed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "project": PROJECT, "region": REGION, "service": SERVICE,
        "revision": REVISION, "failed_source_sha": FAILED_SOURCE_SHA,
        "start": START, "end": END, "limit": LIMIT,
        "gcloud_exit_code": exit_code,
        "qualification": "Actual startup log readback only; not API boot or deployment success.",
    }
    if exit_code:
        document["read_failure_codes"] = failure_codes
        document["nonempty_message_count"] = 0
    else:
        document["returned_rows"] = parsed["returned_rows"]
        document["entries"] = parsed["entries"]
        document["nonempty_message_count"] = len(parsed["entries"])
    return document


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        document = collect()
    except ValueError as error:
        print(str(error))
        raise SystemExit(1) from None
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({
        "output": str(args.output),
        "gcloud_exit_code": document["gcloud_exit_code"],
        "nonempty_message_count": document["nonempty_message_count"],
    }))
    if document["gcloud_exit_code"] or not document["nonempty_message_count"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
