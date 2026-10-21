import contextlib
import copy
import io
import json
from pathlib import Path
import tempfile
import unittest

from tools.ci import verify_passenger_app_postgres_gate as gate

# Independent fixture counts: never derive valid evidence from gate.EXPECTED.
COUNTS = {
    "account-auth-fare-http.test.ts": 13,
    "account-session.postgres.test.ts": 13,
    "booking-history.postgres.test.ts": 5,
    "fare-quote.postgres.test.ts": 15,
    "otp-oauth.postgres.test.ts": 22,
    "payment-http.test.ts": 8,
    "payment.postgres.test.ts": 19,
    "receipt-complaint-http.test.ts": 17,
    "receipt-complaint.postgres.test.ts": 44,
}
ADAPTER = "PAX QA instrumentation callback contract (server-free, no DB acceptance) preserves the native callback overload and restores query before returning a lease"


def evidence(absolute=False):
    suites = []
    for name, count in COUNTS.items():
        path = "tests/unit/pax-qa-20261009/" + name
        cases = [{"fullName": f"{name} case {i}", "status": "passed"} for i in range(count)]
        if name == "receipt-complaint.postgres.test.ts":
            cases[-1]["fullName"] = ADAPTER
        suites.append({"name": ("/runner/work/repo/" if absolute else "") + path,
                       "status": "passed", "assertionResults": cases})
    return {"testResults": suites}


class PassengerAppGateTests(unittest.TestCase):
    def setUp(self):
        self.output = io.StringIO()
        context = contextlib.redirect_stdout(self.output)
        context.__enter__()
        self.addCleanup(context.__exit__, None, None, None)

    def test_fixed_inventory_relative_absolute_and_unrelated_pending(self):
        for absolute in (False, True):
            report = evidence(absolute)
            report["testResults"].append({"name": "/runner/unrelated.test.ts", "status": "pending",
                                          "assertionResults": [{"status": "pending"}]})
            self.assertEqual(gate.verify(report), [])

    def test_required_files_including_booking_must_appear_once(self):
        for i in range(len(COUNTS)):
            with self.subTest(index=i):
                report = evidence()
                report["testResults"].pop(i)
                self.assertTrue(gate.verify(report))
                report = evidence()
                duplicate = copy.deepcopy(report["testResults"][i])
                duplicate["name"] = "/runner/" + duplicate["name"]
                report["testResults"].append(duplicate)
                self.assertTrue(gate.verify(report))

    def test_file_hook_and_assertion_nonpasses_fail_for_every_suite(self):
        for i in range(len(COUNTS)):
            for status in ("failed", "pending", "skipped", "todo", None):
                with self.subTest(index=i, status=status):
                    report = evidence()
                    report["testResults"][i]["status"] = status
                    self.assertTrue(gate.verify(report))
                    report = evidence()
                    report["testResults"][i]["assertionResults"][0]["status"] = status
                    self.assertTrue(gate.verify(report))
            for field in ("message", "failureMessage"):
                report = evidence()
                report["testResults"][i][field] = "afterAll failed"
                self.assertTrue(gate.verify(report))

    def test_too_few_or_many_assertions_in_every_suite(self):
        for i in range(len(COUNTS)):
            report = evidence()
            report["testResults"][i]["assertionResults"].pop(0)
            self.assertTrue(gate.verify(report))
            report = evidence()
            report["testResults"][i]["assertionResults"].append({"fullName": "extra", "status": "passed"})
            self.assertTrue(gate.verify(report))

    def test_adapter_missing_duplicate_nonpassed_and_misplaced(self):
        report = evidence()
        report["testResults"][-1]["assertionResults"][-1]["fullName"] = "ordinary case"
        self.assertTrue(gate.verify(report))
        report = evidence()
        report["testResults"][-1]["assertionResults"][0]["fullName"] = ADAPTER
        self.assertTrue(gate.verify(report))
        for status in ("failed", "pending", "skipped", "todo"):
            report = evidence()
            report["testResults"][-1]["assertionResults"][-1]["status"] = status
            self.assertTrue(gate.verify(report))
        report = evidence()
        report["testResults"][0]["assertionResults"][0]["fullName"] = ADAPTER
        self.assertTrue(gate.verify(report))

    def test_unexpected_qa_and_wrong_path_fail(self):
        for absolute in (False, True):
            report = evidence(absolute)
            extra = copy.deepcopy(report["testResults"][0])
            extra["name"] = extra["name"].replace("account-auth-fare-http", "new-suite")
            report["testResults"].append(extra)
            self.assertTrue(gate.verify(report))
        report = evidence()
        report["testResults"][0]["name"] = "/different/account-auth-fare-http.test.ts"
        self.assertTrue(gate.verify(report))

    def test_malformed_report_suite_or_assertions_fail(self):
        for report in (None, [], {}, {"testResults": None}, {"testResults": {}}, {"testResults": []}):
            self.assertTrue(gate.verify(report))
        for malformed in (None, [], "suite", {}, {"name": None}):
            report = evidence()
            report["testResults"].append(malformed)
            self.assertTrue(gate.verify(report))
        for malformed in (None, {}, "assertions"):
            report = evidence()
            report["testResults"][0]["assertionResults"] = malformed
            self.assertTrue(gate.verify(report))
        for malformed in (None, [], "assertion", {}):
            report = evidence()
            report["testResults"][0]["assertionResults"][0] = malformed
            self.assertTrue(gate.verify(report))

    def test_cli_exit_codes_missing_malformed_and_valid_report(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "report.json"
            self.assertEqual(gate.main([]), 1)
            self.assertEqual(gate.main([str(path)]), 1)
            for text in ("{", "null", "{}", '{"testResults": null}'):
                path.write_text(text)
                self.assertEqual(gate.main([str(path)]), 1)
            path.write_text(json.dumps(evidence()))
            self.assertEqual(gate.main([str(path)]), 0)
            self.assertIn("native PG=117; HTTP=38; business=155; adapter=1; total=156", self.output.getvalue())
            report = evidence()
            report["testResults"][2]["assertionResults"][0]["status"] = "pending"
            path.write_text(json.dumps(report))
            self.assertEqual(gate.main([str(path)]), 1)


if __name__ == "__main__":
    unittest.main()
