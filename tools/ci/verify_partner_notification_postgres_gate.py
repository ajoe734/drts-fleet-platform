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
    transport_passed = 0
    skipped_cases = 0
    failed_cases = 0
    unknown_cases = 0

    for suite, suite_name in [(seq_suite, "sequence"), (transport_suite, "transport")]:
        for assertion in suite.get("assertionResults", []):
            status = assertion.get("status")
            if status == "passed":
                if suite_name == "sequence":
                    seq_passed += 1
                else:
                    transport_passed += 1
            elif status in ["pending", "skipped"]:
                skipped_cases += 1
            elif status == "failed":
                failed_cases += 1
            else:
                unknown_cases += 1

    total_cases = seq_passed + transport_passed + skipped_cases + failed_cases + unknown_cases

    print(f"Sequence suite passed: {seq_passed}")
    print(f"Transport suite passed: {transport_passed}")
    print(f"Skipped: {skipped_cases}")
    print(f"Failed: {failed_cases}")
    print(f"Unknown: {unknown_cases}")

    if seq_passed != 7 or transport_passed != 7:
        print("Error: Expected exactly 7 passed cases for both sequence and transport suites.")
        sys.exit(1)

    if skipped_cases > 0:
        print("Error: Found skipped test cases. Zero skips allowed.")
        sys.exit(1)

    if failed_cases > 0:
        print("Error: Found failed test cases.")
        sys.exit(1)
        
    if unknown_cases > 0:
        print("Error: Found unknown test cases.")
        sys.exit(1)

    if total_cases != 14:
        print(f"Error: Expected exactly 14 cases, but found {total_cases}.")
        sys.exit(1)

    print("Postgres gate passed successfully.")

if __name__ == "__main__":
    main()
