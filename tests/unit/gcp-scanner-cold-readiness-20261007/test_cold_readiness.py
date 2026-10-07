"""Regressions for SR-GCP-SCANNER-COLD-READINESS-20261007.

Covers the two source changes only, both exercised through mocks -- no
server, engine or DB is ever started:

  1. operations/verification/verify-dev-artifact-backends.py's bounded
     initial-readiness retry (`wait_for_initial_clean_scan`), used by
     Test 1 before any clean-scan success is declared.
  2. operations/deployment/provision-dev-artifact-backends.py's scanner
     Cloud Run deploy call, which must now request `--no-cpu-throttling`
     while retaining every pre-existing private IAM/digest/memory/scaling
     setting unchanged.
"""
import contextlib
import importlib.util
import io
import json
import subprocess
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[3]

VERIFY_SPEC = importlib.util.spec_from_file_location(
    "verify_dev_artifact_backends_cold_readiness",
    ROOT / "operations/verification/verify-dev-artifact-backends.py",
)
verify = importlib.util.module_from_spec(VERIFY_SPEC)
VERIFY_SPEC.loader.exec_module(verify)

PROVISION_SPEC = importlib.util.spec_from_file_location(
    "provision_dev_artifact_backends_cold_readiness",
    ROOT / "operations/deployment/provision-dev-artifact-backends.py",
)
provisioner = importlib.util.module_from_spec(PROVISION_SPEC)
PROVISION_SPEC.loader.exec_module(provisioner)


class WaitForInitialCleanScanTest(unittest.TestCase):
    """Direct control-flow coverage of the new bounded retry helper --
    each case drives it with a stub `scan_fn`, no HTTP/urllib involved."""

    def test_pending_to_healthy_retries_only_the_exact_retryable_condition(self):
        responses = [
            (503, {"error": "scan_engine_not_ready"}),
            (503, {"error": "scan_engine_not_ready"}),
            (200, {"sha256": "abc", "sizeBytes": 3, "verdict": "clean"}),
        ]
        calls = []

        def scan_fn(content, timeout=None):
            calls.append(content)
            return responses.pop(0)

        with patch.object(verify.time, "sleep") as sleep:
            status, body = verify.wait_for_initial_clean_scan(scan_fn, b"clean-bytes")

        self.assertEqual(status, 200)
        self.assertEqual(body["verdict"], "clean")
        self.assertEqual(len(calls), 3)
        # Exactly one bounded sleep per retried (not final) attempt.
        self.assertEqual(sleep.call_count, 2)

    def test_permanently_pending_fails_closed_after_bounded_attempts(self):
        def scan_fn(content, timeout=None):
            return 503, {"error": "scan_engine_not_ready"}

        with patch.object(verify.time, "sleep") as sleep, \
             self.assertRaises(AssertionError) as error:
            verify.wait_for_initial_clean_scan(scan_fn, b"clean-bytes")

        self.assertIn("did not become ready", str(error.exception))
        # Bounded: never more attempts than the configured ceiling, and a
        # 503 is never silently treated as success.
        self.assertEqual(sleep.call_count, verify.SCANNER_INITIAL_READINESS_MAX_ATTEMPTS - 1)

    def test_permanently_pending_fails_closed_at_deadline_expiry_before_attempt_ceiling(self):
        """Even with attempts to spare, a 503 that never resolves before
        the total deadline must still fail closed -- the deadline and the
        attempt ceiling are independent bounds, not just one of them."""
        clock = {"now": 1000.0}
        calls = []

        def fake_monotonic():
            return clock["now"]

        def fake_sleep(seconds):
            clock["now"] += seconds

        def scan_fn(content, timeout=None):
            calls.append(content)
            return 503, {"error": "scan_engine_not_ready"}

        with patch.object(verify, "SCANNER_INITIAL_READINESS_DEADLINE_SECONDS", 3.0), \
             patch.object(verify.time, "monotonic", side_effect=fake_monotonic), \
             patch.object(verify.time, "sleep", side_effect=fake_sleep), \
             self.assertRaises(AssertionError) as error:
            verify.wait_for_initial_clean_scan(scan_fn, b"clean-bytes")

        self.assertIn("deadline", str(error.exception))
        # The deadline (3s at a 2s poll interval) must cut this off at a
        # handful of attempts, nowhere near the much larger attempt
        # ceiling -- proving the deadline bound itself is enforced, not
        # merely the attempt ceiling with a coincidentally similar effect.
        self.assertLess(len(calls), verify.SCANNER_INITIAL_READINESS_MAX_ATTEMPTS)

    def test_scan_at_or_after_deadline_never_starts_and_late_clean_cannot_pass(self):
        """Regression for the captured counterexample against the prior
        cut (.local/full-system-completion-20261007/round3/
        cold-deadline-counterexample.json): deadline=3s, a 503 that
        itself takes 1s lands inside the deadline, the 2s poll sleep
        lands exactly on the deadline, and a second attempt that would
        only return a genuine-shaped 200 at t=4s must never be allowed to
        start -- checking the deadline only after a 503 comes back let
        that late clean receipt slip through as a pass."""
        clock = {"now": 1000.0}
        calls = []

        def fake_monotonic():
            return clock["now"]

        def fake_sleep(seconds):
            clock["now"] += seconds

        def scan_fn(content, timeout=None):
            calls.append(timeout)
            if len(calls) == 1:
                clock["now"] += 1  # first 503 lands at t=1s, inside the 3s deadline
                return 503, {"error": "scan_engine_not_ready"}
            clock["now"] += 1  # would-be clean response only resolves at t=4s
            return 200, {"sha256": "abc", "sizeBytes": 3, "verdict": "clean"}

        with patch.object(verify, "SCANNER_INITIAL_READINESS_DEADLINE_SECONDS", 3.0), \
             patch.object(verify.time, "monotonic", side_effect=fake_monotonic), \
             patch.object(verify.time, "sleep", side_effect=fake_sleep), \
             self.assertRaises(AssertionError) as error:
            verify.wait_for_initial_clean_scan(scan_fn, b"clean-bytes")

        self.assertIn("deadline expired before another attempt could start", str(error.exception))
        # The second attempt -- the one that would have returned the late
        # clean receipt -- never started.
        self.assertEqual(len(calls), 1)
        # The first (only) attempt was threaded the remaining budget, not
        # some fixed/unbounded timeout.
        self.assertEqual(calls[0], 3)

    def test_late_response_after_deadline_is_rejected_even_with_a_valid_200(self):
        """Regression for the captured counterexample against the prior
        cut (.local/full-system-completion-20261007/round3/
        cold-postresponse-counterexample.json): a single attempt starts at
        t=0 with a 3s deadline/timeout, but the call itself does not
        actually return until t=4s -- past the deadline -- with a
        perfectly well-formed clean 200 receipt. The supplied `timeout=`
        only bounds a socket operation, not the whole call, so this must
        still fail closed instead of being accepted as a pass."""
        clock = {"now": 1000.0}
        calls = []

        def fake_monotonic():
            return clock["now"]

        def fake_sleep(seconds):
            clock["now"] += seconds

        def scan_fn(content, timeout=None):
            calls.append(timeout)
            clock["now"] += 4  # resolves at t=4s despite a 3s deadline/timeout
            return 200, {"sha256": "abc", "sizeBytes": 3, "verdict": "clean"}

        with patch.object(verify, "SCANNER_INITIAL_READINESS_DEADLINE_SECONDS", 3.0), \
             patch.object(verify.time, "monotonic", side_effect=fake_monotonic), \
             patch.object(verify.time, "sleep", side_effect=fake_sleep), \
             self.assertRaises(AssertionError) as error:
            verify.wait_for_initial_clean_scan(scan_fn, b"clean-bytes")

        self.assertIn("after the total deadline had already expired", str(error.exception))
        # Only the one, late-resolving attempt was ever made.
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0], 3)

    def test_single_clock_retry_still_passes_comfortably_inside_the_deadline(self):
        """Same single-clock shape as the counterexample regression, but
        with slack to spare, so the stricter pre-attempt deadline check
        does not also rot a legitimate, on-time retry."""
        clock = {"now": 1000.0}
        responses = [
            (503, {"error": "scan_engine_not_ready"}),
            (200, {"sha256": "abc", "sizeBytes": 3, "verdict": "clean"}),
        ]
        calls = []

        def fake_monotonic():
            return clock["now"]

        def fake_sleep(seconds):
            clock["now"] += seconds

        def scan_fn(content, timeout=None):
            calls.append(timeout)
            return responses.pop(0)

        with patch.object(verify, "SCANNER_INITIAL_READINESS_DEADLINE_SECONDS", 10.0), \
             patch.object(verify.time, "monotonic", side_effect=fake_monotonic), \
             patch.object(verify.time, "sleep", side_effect=fake_sleep):
            status, body = verify.wait_for_initial_clean_scan(scan_fn, b"clean-bytes")

        self.assertEqual(status, 200)
        self.assertEqual(body["verdict"], "clean")
        self.assertEqual(len(calls), 2)

    def test_poll_sleep_is_capped_to_remaining_budget_not_the_full_interval(self):
        """Less time remains than the configured poll interval: the sleep
        must be capped to what's actually left, or it would itself
        overshoot the deadline before the next check ever runs."""
        clock = {"now": 1000.0}
        sleeps = []

        def fake_monotonic():
            return clock["now"]

        def fake_sleep(seconds):
            sleeps.append(seconds)
            clock["now"] += seconds

        def scan_fn(content, timeout=None):
            return 503, {"error": "scan_engine_not_ready"}

        with patch.object(verify, "SCANNER_INITIAL_READINESS_DEADLINE_SECONDS", 1.5), \
             patch.object(verify.time, "monotonic", side_effect=fake_monotonic), \
             patch.object(verify.time, "sleep", side_effect=fake_sleep), \
             self.assertRaises(AssertionError):
            verify.wait_for_initial_clean_scan(scan_fn, b"clean-bytes")

        self.assertEqual(sleeps, [1.5])
        self.assertLess(sleeps[0], verify.SCANNER_INITIAL_READINESS_POLL_INTERVAL_SECONDS)

    def test_auth403_is_not_retried(self):
        calls = []

        def scan_fn(content, timeout=None):
            calls.append(content)
            return 403, {"error": "forbidden"}

        with patch.object(verify.time, "sleep") as sleep:
            status, body = verify.wait_for_initial_clean_scan(scan_fn, b"clean-bytes")

        self.assertEqual(status, 403)
        self.assertEqual(len(calls), 1)
        sleep.assert_not_called()

    def test_non_readiness_503_is_not_retried(self):
        """A 503 with a different error body is a real, distinct failure --
        not the transient cold-start condition -- and must never be
        silently retried or coerced into a pass."""
        calls = []

        def scan_fn(content, timeout=None):
            calls.append(content)
            return 503, {"error": "scan_engine_unavailable"}

        with patch.object(verify.time, "sleep") as sleep:
            status, body = verify.wait_for_initial_clean_scan(scan_fn, b"clean-bytes")

        self.assertEqual(status, 503)
        self.assertEqual(body["error"], "scan_engine_unavailable")
        self.assertEqual(len(calls), 1)
        sleep.assert_not_called()

    def test_malformed_non_dict_body_is_not_retried(self):
        """A non-JSON/non-dict body (e.g. a plain-text error page) must
        never be mistaken for the structured scan_engine_not_ready
        receipt -- it is returned immediately for the caller to fail on,
        exactly like today's non-JSON-body handling elsewhere in this
        script."""
        def scan_fn(content, timeout=None):
            return 503, "upstream gateway error"

        with patch.object(verify.time, "sleep") as sleep:
            status, body = verify.wait_for_initial_clean_scan(scan_fn, b"clean-bytes")

        self.assertEqual(status, 503)
        self.assertEqual(body, "upstream gateway error")
        sleep.assert_not_called()

    def test_wrong_verdict_on_200_is_returned_for_caller_to_reject(self):
        """A 200 with the wrong verdict/hash/size is a real failure, not a
        readiness signal -- it must be returned (and therefore fail the
        caller's assert_receipt) on the very first attempt, never retried
        away."""
        calls = []

        def scan_fn(content, timeout=None):
            calls.append(content)
            return 200, {"sha256": "deadbeef", "sizeBytes": 3, "verdict": "infected"}

        with patch.object(verify.time, "sleep") as sleep:
            status, body = verify.wait_for_initial_clean_scan(scan_fn, b"clean-bytes")

        self.assertEqual(status, 200)
        self.assertEqual(body["verdict"], "infected")
        self.assertEqual(len(calls), 1)
        sleep.assert_not_called()


class TestScannerInitialReadinessIntegrationTest(unittest.TestCase):
    """Drives the real `test_scanner` entrypoint end-to-end (urlopen
    mocked) so Test 1's cold-start retry is proven inside the actual
    helper/control flow, not just in isolation, and that Tests 2-4b still
    run and pass unchanged immediately afterward."""

    @patch("urllib.request.urlopen")
    @patch("os.environ.get")
    def test_cold_start_pending_to_healthy_then_remaining_tests_pass(self, mock_env, mock_urlopen):
        mock_env.return_value = "fake-token"
        responses = [
            (503, {"error": "scan_engine_not_ready"}),
            (503, {"error": "scan_engine_not_ready"}),
            (200, {"sha256": verify.hashlib.sha256(verify.CLEAN).hexdigest(),
                   "sizeBytes": len(verify.CLEAN), "verdict": "clean"}),
            (200, {"sha256": verify.hashlib.sha256(verify.EICAR).hexdigest(),
                   "sizeBytes": len(verify.EICAR), "verdict": "infected"}),
            (400, {"sha256": "wrong", "sizeBytes": -1, "error": "content_sha256_mismatch"}),
            (413, {"sha256": "x", "sizeBytes": -1, "error": "payload_too_large"}),
            (502, {"error": "scan_engine_indeterminate"}),
        ]

        def side_effect(req, timeout=30):
            status, body = responses.pop(0)
            if status >= 400:
                err = urllib.error.HTTPError(req.full_url, status, "Error", hdrs={}, fp=None)
                err.read = MagicMock(return_value=json.dumps(body).encode())
                raise err
            resp = MagicMock()
            resp.status = status
            resp.read = MagicMock(return_value=json.dumps(body).encode())
            cm = MagicMock()
            cm.__enter__.return_value = resp
            return cm

        mock_urlopen.side_effect = side_effect

        with patch.object(verify.time, "sleep"):
            result = verify.test_scanner("http://fake")

        self.assertFalse(result, "no hosted scenario was requested, so the manual-only branch returns False")
        self.assertEqual(responses, [], "every queued response must have been consumed exactly once")

    @patch("urllib.request.urlopen")
    @patch("os.environ.get")
    def test_permanently_pending_initial_scan_fails_the_whole_run(self, mock_env, mock_urlopen):
        mock_env.return_value = "fake-token"

        def side_effect(req, timeout=30):
            err = urllib.error.HTTPError(req.full_url, 503, "Error", hdrs={}, fp=None)
            err.read = MagicMock(return_value=json.dumps({"error": "scan_engine_not_ready"}).encode())
            raise err

        mock_urlopen.side_effect = side_effect

        with patch.object(verify.time, "sleep"), self.assertRaises(AssertionError) as error:
            verify.test_scanner("http://fake")

        self.assertIn("did not become ready", str(error.exception))

    @patch("urllib.request.urlopen")
    @patch("os.environ.get")
    def test_single_clock_counterexample_never_issues_a_late_request(self, mock_env, mock_urlopen):
        """Same counterexample clock shape as
        WaitForInitialCleanScanTest.test_scan_at_or_after_deadline_never_starts_and_late_clean_cannot_pass,
        driven through the real `test_scanner()` entrypoint (urlopen
        mocked) -- proves the fix holds in the actual call path Test 1
        uses, not only when `wait_for_initial_clean_scan` is driven
        directly."""
        mock_env.return_value = "fake-token"
        clock = {"now": 1000.0}
        calls = []

        def fake_monotonic():
            return clock["now"]

        def fake_sleep(seconds):
            clock["now"] += seconds

        def urlopen_side_effect(req, timeout=30):
            calls.append(timeout)
            if len(calls) == 1:
                clock["now"] += 1
                err = urllib.error.HTTPError(req.full_url, 503, "Error", hdrs={}, fp=None)
                err.read = MagicMock(return_value=json.dumps({"error": "scan_engine_not_ready"}).encode())
                raise err
            clock["now"] += 1
            resp = MagicMock()
            resp.status = 200
            resp.read = MagicMock(return_value=json.dumps({
                "sha256": verify.hashlib.sha256(verify.CLEAN).hexdigest(),
                "sizeBytes": len(verify.CLEAN), "verdict": "clean",
            }).encode())
            cm = MagicMock()
            cm.__enter__.return_value = resp
            return cm

        mock_urlopen.side_effect = urlopen_side_effect

        with patch.object(verify, "SCANNER_INITIAL_READINESS_DEADLINE_SECONDS", 3.0), \
             patch.object(verify.time, "monotonic", side_effect=fake_monotonic), \
             patch.object(verify.time, "sleep", side_effect=fake_sleep), \
             self.assertRaises(AssertionError) as error:
            verify.test_scanner("http://fake")

        self.assertIn("deadline expired before another attempt could start", str(error.exception))
        # The would-be-clean second request must never have been issued.
        self.assertEqual(len(calls), 1)

    @patch("urllib.request.urlopen")
    @patch("os.environ.get")
    def test_late_response_after_deadline_is_rejected_through_the_real_entrypoint(self, mock_env, mock_urlopen):
        """Same counterexample clock shape as
        WaitForInitialCleanScanTest.test_late_response_after_deadline_is_rejected_even_with_a_valid_200,
        driven through the real `test_scanner()` entrypoint (urlopen
        mocked) -- proves a single attempt that resolves after the
        deadline is rejected in the actual call path Test 1 uses, even
        though urlopen returns a well-formed clean 200."""
        mock_env.return_value = "fake-token"
        clock = {"now": 1000.0}
        calls = []

        def fake_monotonic():
            return clock["now"]

        def fake_sleep(seconds):
            clock["now"] += seconds

        def urlopen_side_effect(req, timeout=30):
            calls.append(timeout)
            clock["now"] += 4  # resolves at t=4s despite a 3s deadline/timeout
            resp = MagicMock()
            resp.status = 200
            resp.read = MagicMock(return_value=json.dumps({
                "sha256": verify.hashlib.sha256(verify.CLEAN).hexdigest(),
                "sizeBytes": len(verify.CLEAN), "verdict": "clean",
            }).encode())
            cm = MagicMock()
            cm.__enter__.return_value = resp
            return cm

        mock_urlopen.side_effect = urlopen_side_effect

        with patch.object(verify, "SCANNER_INITIAL_READINESS_DEADLINE_SECONDS", 3.0), \
             patch.object(verify.time, "monotonic", side_effect=fake_monotonic), \
             patch.object(verify.time, "sleep", side_effect=fake_sleep), \
             self.assertRaises(AssertionError) as error:
            verify.test_scanner("http://fake")

        self.assertIn("after the total deadline had already expired", str(error.exception))
        self.assertEqual(len(calls), 1)


GOOD_ARGS = [
    "--project", "drts-dev-devcc-20260825",
    "--region", "us-central1",
    "--document-bucket", "drts-dev-devcc-20260825-document-artifacts",
    "--remittance-bucket", "drts-dev-devcc-20260825-remittance-proofs",
    "--runtime-service-account", "drts-dev-runtime@drts-dev-devcc-20260825.iam.gserviceaccount.com",
    "--scanner-service", "drts-dev-artifact-scanner",
    "--scanner-service-account", "drts-dev-artifact-scanner@drts-dev-devcc-20260825.iam.gserviceaccount.com",
    "--gateway-image", "us-central1-docker.pkg.dev/drts-dev-devcc-20260825/drts/artifact-scanner-gateway@sha256:" + "a" * 64,
    "--clamd-image", "us-central1-docker.pkg.dev/drts-dev-devcc-20260825/drts/artifact-scanner-clamd@sha256:" + "b" * 64,
    "--invoker-member", "drts-dev-runtime@drts-dev-devcc-20260825.iam.gserviceaccount.com",
]
GOOD_PROJECT_NUMBER = "123456789012"
GOOD_REGION = "us-central1"


def _owned_bucket_json(project_number=GOOD_PROJECT_NUMBER, region=GOOD_REGION):
    return json.dumps({"location": region.upper(), "name": "irrelevant-for-this-fixture",
                        "projectNumber": project_number})


def _good_provisioning_side_effect(args, **kwargs):
    if args[:3] == ["gcloud", "projects", "describe"]:
        return subprocess.CompletedProcess(args, 0, GOOD_PROJECT_NUMBER + "\n")
    if args[:4] == ["gcloud", "storage", "buckets", "describe"]:
        if "--format=value(versioning_enabled)" in args:
            return subprocess.CompletedProcess(args, 0, "True\n")
        return subprocess.CompletedProcess(args, 0, _owned_bucket_json())
    if args[:4] == ["gcloud", "run", "services", "get-iam-policy"]:
        return subprocess.CompletedProcess(args, 0, json.dumps({"bindings": []}))
    return subprocess.CompletedProcess(args, 0, "")


class ProvisionScannerCpuAndProbePolicyTest(unittest.TestCase):
    """operations/deployment/provision-dev-artifact-backends.py: every
    gcloud/deploy call is mocked at the subprocess boundary; no real
    bucket, IAM binding or Cloud Run service is ever touched."""

    def run_main(self, argv, run_side_effect):
        with patch.object(provisioner.subprocess, "run", side_effect=run_side_effect) as run, \
             patch("sys.argv", ["provision", *argv]), \
             contextlib.redirect_stdout(io.StringIO()), \
             contextlib.redirect_stderr(io.StringIO()):
            code = provisioner.main()
        return code, run.call_args_list

    def test_deploy_requests_no_cpu_throttling_and_keeps_prior_settings(self):
        code, calls = self.run_main(GOOD_ARGS, _good_provisioning_side_effect)
        self.assertEqual(code, 0)

        deploy_calls = [
            call.args[0] for call in calls
            if call.args[0] and call.args[0][0] == str(provisioner.DEPLOY_CLOUD_RUN_SERVICE)
        ]
        self.assertEqual(len(deploy_calls), 1)
        deploy_args = deploy_calls[0]

        # The actual repair: background freshclam/clamd must have CPU
        # outside of request processing too.
        self.assertIn("--no-cpu-throttling", deploy_args)

        # Everything this task must NOT weaken stays exactly as before.
        self.assertIn("--no-allow-unauthenticated", deploy_args)
        self.assertNotIn("--allow-unauthenticated", deploy_args)
        self.assertIn("--invoker-iam-check", deploy_args)
        self.assertNotIn("--no-invoker-iam-check", deploy_args)
        self.assertEqual(deploy_args[deploy_args.index("--min-instances") + 1], "0")
        self.assertEqual(deploy_args[deploy_args.index("--max-instances") + 1], "1")
        self.assertEqual(deploy_args[deploy_args.index("--concurrency") + 1], "1")
        memory_indices = [i for i, a in enumerate(deploy_args) if a == "--memory"]
        memory_values = {deploy_args[i + 1] for i in memory_indices}
        self.assertEqual(memory_values, {"512Mi", "4Gi"})
        self.assertIn(GOOD_ARGS[GOOD_ARGS.index("--gateway-image") + 1], deploy_args)
        self.assertIn(GOOD_ARGS[GOOD_ARGS.index("--clamd-image") + 1], deploy_args)
        # The probe surface (TCP on the gateway's declared port) is
        # unchanged: no new/public ingress and no new probe flags.
        self.assertIn("--port", deploy_args)
        self.assertEqual(deploy_args[deploy_args.index("--port") + 1], "8080")
        self.assertNotIn("--allow-unauthenticated", deploy_args)

    def test_no_cpu_throttling_present_even_when_reusing_existing_resources(self):
        """Re-provisioning an already-existing, already-correct service
        must still re-assert --no-cpu-throttling on every run -- the
        script's existing idempotent-reassertion contract must cover this
        new flag too, not just the settings that existed before this
        task."""
        code, calls = self.run_main(GOOD_ARGS, _good_provisioning_side_effect)
        self.assertEqual(code, 0)
        deploy_args = next(
            call.args[0] for call in calls
            if call.args[0] and call.args[0][0] == str(provisioner.DEPLOY_CLOUD_RUN_SERVICE)
        )
        self.assertIn("--no-cpu-throttling", deploy_args)


if __name__ == "__main__":
    unittest.main()
