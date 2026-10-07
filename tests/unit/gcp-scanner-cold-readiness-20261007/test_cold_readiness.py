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

        def scan_fn(content):
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
        def scan_fn(content):
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

        def scan_fn(content):
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

    def test_auth403_is_not_retried(self):
        calls = []

        def scan_fn(content):
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

        def scan_fn(content):
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
        def scan_fn(content):
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

        def scan_fn(content):
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
