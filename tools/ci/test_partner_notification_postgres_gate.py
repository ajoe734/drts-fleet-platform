import copy
import contextlib
import importlib.util
import io
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("push_gate", Path(__file__).with_name("verify_passenger_push_channel_postgres_gate.py"))
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)


def evidence():
    return {"testResults": [{"name": "/runner/work/repo/" + path, "status": "passed", "message": "",
        "assertionResults": [{"fullName": f"{path} case {i}", "status": "passed"} for i in range(count)]}
        for path, count in gate.EXPECTED.items()]}


class PostgresGateTests(unittest.TestCase):
    def setUp(self):
        self.output = contextlib.redirect_stdout(io.StringIO())
        self.output.__enter__()
        self.addCleanup(self.output.__exit__, None, None, None)

    def test_exact_counts_pass(self):
        self.assertEqual(gate.verify([evidence()]), [])

    def test_original_seven_case_requirements_are_preserved(self):
        for path in gate.EXPECTED:
            if "sr-partner-notify-" in path:
                self.assertEqual(gate.EXPECTED[path], 7)

    def test_every_required_suite_must_exist_once(self):
        for i in range(len(gate.EXPECTED)):
            with self.subTest(index=i):
                report = evidence()
                report["testResults"].pop(i)
                self.assertTrue(gate.verify([report]))
                report = evidence()
                report["testResults"].append(copy.deepcopy(report["testResults"][i]))
                self.assertTrue(gate.verify([report]))

    def test_every_nonpassed_status_fails(self):
        for status in ["failed", "pending", "skipped", "todo", "disabled", None]:
            with self.subTest(status=status):
                report = evidence()
                report["testResults"][0]["assertionResults"][0]["status"] = status
                self.assertTrue(gate.verify([report]))

    def test_under_and_over_counts_fail(self):
        for delta in [-1, 1]:
            report = evidence()
            cases = report["testResults"][0]["assertionResults"]
            if delta < 0:
                cases.pop()
            else:
                cases.append({"fullName": "extra", "status": "passed"})
            self.assertTrue(gate.verify([report]))

    def test_hook_failure_cannot_hide_behind_passed_assertions(self):
        for field, value in [("status", "failed"), ("message", "afterAll failed"), ("failureMessage", "setup failed")]:
            report = evidence()
            report["testResults"][0][field] = value
            self.assertTrue(gate.verify([report]))

    def test_duplicate_assertion_identity_fails(self):
        report = evidence()
        cases = report["testResults"][0]["assertionResults"]
        cases[1]["fullName"] = cases[0]["fullName"]
        self.assertTrue(gate.verify([report]))

    def test_report_shapes_and_unrelated_same_basename_fail(self):
        for report in [{}, {"testResults": None}, {"testResults": []}]:
            self.assertTrue(gate.verify([report]))
        report = evidence()
        report["testResults"][0]["name"] = "/other/referral.postgres.test.ts"
        self.assertTrue(gate.verify([report]))

    def test_regression_suite_must_run_without_skips(self):
        path = "tests/unit/regression.test.ts"
        report = evidence()
        self.assertTrue(gate.verify([report], [path]))
        report["testResults"].append({"name": path, "status": "passed", "assertionResults": [{"fullName": "regression", "status": "passed"}]})
        self.assertEqual(gate.verify([report], [path]), [])
        report["testResults"][-1]["assertionResults"][0]["status"] = "skipped"
        self.assertTrue(gate.verify([report], [path]))


if __name__ == "__main__":
    unittest.main()
