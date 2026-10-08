#!/usr/bin/env python3
"""Fail closed on missing, duplicated, failed, skipped or under-counted suites."""
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
PREFIX = "tests/unit/push-channel-pg-qa-20261006/"
EXPECTED = {
    PREFIX + "referral.postgres.test.ts": 7,
    PREFIX + "registry.postgres.test.ts": 11,
    PREFIX + "delivery.postgres.test.ts": 10,
    PREFIX + "dormant.test.ts": 3,
    "tests/unit/system-remediation/sr-partner-notify-seq-20260918/notification-sequence.postgres.test.ts": 7,
    "tests/unit/system-remediation/sr-partner-notify-transport-20260918/transport.postgres.test.ts": 7,
    "tests/unit/system-remediation/sr-partner-notify-ui-20260917/notification-ui.postgres.test.ts": 7,
    "tests/unit/system-remediation/sr-qa-webhook-001/sr-qa-webhook-001.test.ts": 34,
}


def regression_paths():
    patterns = [
        "tests/unit/system-remediation/sr-partner-notify-*/*.test.ts",
        "tests/unit/system-remediation/sr-partner-notify-*/*.test.tsx",
        "tests/unit/push-referral-*/*.test.ts",
        "tests/unit/push-first-party-*/*.test.ts",
        "tests/unit/push-channel-router-*/*.test.ts",
    ]
    return sorted({p.relative_to(ROOT).as_posix() for pattern in patterns for p in ROOT.glob(pattern)})


def verify(reports, regression=()):
    required = dict.fromkeys(regression)
    required.update(EXPECTED)
    errors = []
    suites = []
    for report in reports:
        if not isinstance(report, dict) or not isinstance(report.get("testResults"), list):
            errors.append("Malformed report: testResults must be an array")
        else:
            suites.extend(report["testResults"])
    for path, count in required.items():
        matches = [s for s in suites if isinstance(s, dict) and
                   (str(s.get("name", "")).replace("\\", "/") == path or
                    str(s.get("name", "")).replace("\\", "/").endswith("/" + path))]
        if len(matches) != 1:
            errors.append(f"{path}: expected one suite, got {len(matches)}")
            continue
        suite = matches[0]
        assertions = suite.get("assertionResults")
        if not isinstance(assertions, list):
            errors.append(f"{path}: assertionResults must be an array")
            continue
        passed = sum(isinstance(a, dict) and a.get("status") == "passed" for a in assertions)
        other = len(assertions) - passed
        expected = str(count) if count is not None else ">0"
        print(f"{path}: passed={passed} expected={expected} other={other} expected=0")
        if suite.get("status") != "passed" or suite.get("message") or suite.get("failureMessage"):
            errors.append(f"{path}: failed suite/hook")
        if other or not passed or (count is not None and passed != count):
            errors.append(f"{path}: wrong passed count or non-passed case")
        names = [a.get("fullName") for a in assertions if isinstance(a, dict)]
        if any(not name for name in names) or len(set(names)) != len(names):
            errors.append(f"{path}: missing or duplicate assertion identities")
    return errors


def main(paths):
    if not paths:
        print("Usage: verify_passenger_push_channel_postgres_gate.py <vitest-json-report> [more_reports...]")
        return 1
    try:
        reports = [json.loads(Path(p).read_text()) for p in paths]
        errors = verify(reports, regression_paths())
    except (OSError, ValueError) as error:
        print(f"Cannot read test evidence: {error}")
        return 1
    for error in errors:
        print("ERROR: " + error)
    if not errors:
        print("Passenger push PostgreSQL, regression and dormant gates passed (zero skips).")
    return int(bool(errors))


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
