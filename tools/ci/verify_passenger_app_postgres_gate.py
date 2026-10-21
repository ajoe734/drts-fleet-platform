#!/usr/bin/env python3
"""Read the fixed passenger QA inventory from the existing Vitest JSON report."""
import json
from pathlib import Path
import sys

PREFIX = "tests/unit/pax-qa-20261009/"
# Source-derived collection after V0126 policy cases: 117 native PG + 38 HTTP + 1 adapter.
EXPECTED = {
    PREFIX + "account-auth-fare-http.test.ts": 13,
    PREFIX + "account-session.postgres.test.ts": 13,
    PREFIX + "booking-history.postgres.test.ts": 5,
    PREFIX + "fare-quote.postgres.test.ts": 15,
    PREFIX + "otp-oauth.postgres.test.ts": 22,
    PREFIX + "payment-http.test.ts": 8,
    PREFIX + "payment.postgres.test.ts": 19,
    PREFIX + "receipt-complaint-http.test.ts": 17,
    PREFIX + "receipt-complaint.postgres.test.ts": 44,
}
ADAPTER = (
    "PAX QA instrumentation callback contract (server-free, no DB acceptance) "
    "preserves the native callback overload and restores query before returning a lease"
)
RECEIPT = PREFIX + "receipt-complaint.postgres.test.ts"


def qa_path(name):
    if not isinstance(name, str):
        return None
    if name.startswith(PREFIX):
        return name
    marker = "/" + PREFIX
    if name.startswith("/") and marker in name:
        return PREFIX + name.rsplit(marker, 1)[1]
    return None


def verify(report):
    if not isinstance(report, dict) or not isinstance(report.get("testResults"), list):
        return ["Malformed report: testResults must be an array"]
    errors = []
    found = {path: [] for path in EXPECTED}
    for suite in report["testResults"]:
        if not isinstance(suite, dict) or not isinstance(suite.get("name"), str):
            errors.append("Malformed testResults entry: named suite object required")
            continue
        path = qa_path(suite["name"])
        if path in found:
            found[path].append(suite)
        elif path is not None:
            errors.append(f"Unexpected passenger QA suite: {path}")
    for path, count in EXPECTED.items():
        matches = found[path]
        if len(matches) != 1:
            errors.append(f"{path}: expected one suite, got {len(matches)}")
            continue
        suite = matches[0]
        if suite.get("status") != "passed" or suite.get("message") or suite.get("failureMessage"):
            errors.append(f"{path}: suite/hook did not pass")
        assertions = suite.get("assertionResults")
        if not isinstance(assertions, list):
            errors.append(f"{path}: assertionResults must be an array")
            continue
        if len(assertions) != count:
            errors.append(f"{path}: expected {count} assertions, got {len(assertions)}")
        if any(not isinstance(a, dict) or a.get("status") != "passed" for a in assertions):
            errors.append(f"{path}: every assertion must pass (zero failed/pending/skipped/todo)")
        adapters = [a for a in assertions if isinstance(a, dict) and a.get("fullName") == ADAPTER]
        if (path == RECEIPT and len(adapters) != 1) or (path != RECEIPT and adapters):
            errors.append(f"{path}: expected exactly one adapter in receipt PG and none elsewhere")
    return errors


def main(paths):
    if len(paths) != 1:
        print("Usage: verify_passenger_app_postgres_gate.py <vitest-json-report>")
        return 1
    try:
        report = json.loads(Path(paths[0]).read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        print(f"Cannot read passenger QA evidence: {error}")
        return 1
    errors = verify(report)
    for error in errors:
        print("ERROR: " + error)
    if errors:
        return 1
    print("Passenger App QA: 9 suites; native PG=117; HTTP=38; business=155; adapter=1; total=156; failed=0; skipped=0")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
