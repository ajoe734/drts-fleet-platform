#!/usr/bin/env python3
import json
import sys

def main():
    if len(sys.argv) < 2:
        print("Usage: test_partner_notification_postgres_gate.py <vitest-json-report>")
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
        
    total_cases = 0
    skipped_cases = 0
    failed_cases = 0
    
    for suite in [seq_suite, transport_suite]:
        for assertion in suite.get("assertionResults", []):
            total_cases += 1
            status = assertion.get("status")
            if status == "pending" or status == "skipped":
                skipped_cases += 1
            elif status == "failed":
                failed_cases += 1
                
    print(f"Found {total_cases} test cases (Expected 14).")
    print(f"Skipped: {skipped_cases}")
    print(f"Failed: {failed_cases}")
    
    if total_cases < 14:
        print("Error: Expected at least 14 test cases.")
        sys.exit(1)
        
    if skipped_cases > 0:
        print("Error: Found skipped test cases. Zero skips allowed.")
        sys.exit(1)
        
    if failed_cases > 0:
        print("Error: Found failed test cases.")
        sys.exit(1)
        
    print("Postgres gate passed successfully.")
    
if __name__ == "__main__":
    main()
