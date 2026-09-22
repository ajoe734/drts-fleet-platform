#!/usr/bin/env python3
import json
import sys

def main():
    if len(sys.argv) < 2:
        print("Usage: verify_partner_notification_postgres_gate.py <vitest-json-report>")
        sys.exit(1)

    report_path = sys.argv[1]
    try:
        with open(report_path, 'r') as f:
            report = json.load(f)
    except Exception as e:
        print(f"Failed to load report {report_path}: {e}")
        sys.exit(1)

    seq_suite = None
    transport_suite = None

    for suite in report.get("testResults", []):
        name = suite.get("name", "")
        if "notification-sequence.postgres.test.ts" in name:
            seq_suite = suite
        elif "transport.postgres.test.ts" in name:
            transport_suite = suite

    if not seq_suite or not transport_suite:
        print("Error: Could not find sequence or transport postgres test suites in the report.")
        sys.exit(1)

    seq_passed = 0
    seq_other = 0
    transport_passed = 0
    transport_other = 0

    for assertion in seq_suite.get("assertionResults", []):
        if assertion.get("status") == "passed":
            seq_passed += 1
        else:
            seq_other += 1

    for assertion in transport_suite.get("assertionResults", []):
        if assertion.get("status") == "passed":
            transport_passed += 1
        else:
            transport_other += 1

    print(f"Sequence suite: passed cases={seq_passed} (Expected 7), other cases={seq_other} (Expected 0)")
    print(f"Transport suite: passed cases={transport_passed} (Expected 7), other cases={transport_other} (Expected 0)")

    if seq_passed != 7 or transport_passed != 7 or seq_other != 0 or transport_other != 0:
        print("Error: Expected exactly 7 passed cases and 0 other cases in each suite.")
        sys.exit(1)

    print("Postgres gate passed successfully.")

if __name__ == "__main__":
    main()
