"""Exercise the real verifier's HTTP boundary; no engine or server is started."""

import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import unittest
import urllib.error
from unittest.mock import MagicMock, patch


ROOT = Path(__file__).resolve().parents[3]
SPEC = importlib.util.spec_from_file_location(
    "verify_dev_artifact_backends_eicar",
    ROOT / "operations/verification/verify-dev-artifact-backends.py",
)
verify = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(verify)

# Published canonical 68-byte canary; independent of the verifier's fixture.
EICAR_SHA256 = "275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f"
EICAR_MD5 = "44d88612fea8a8f36de82e1278abb02f"
SCANNER_URL = "https://scanner.example.invalid"


def receipt(content, verdict):
    return {"sha256": hashlib.sha256(content).hexdigest(),
            "sizeBytes": len(content), "verdict": verdict}


class EicarCanaryTest(unittest.TestCase):
    def assert_canonical(self, content):
        self.assertEqual(len(content), 68)
        self.assertTrue(content.startswith(b"X5O!P%@AP[4\\PZX54"))
        self.assertEqual(hashlib.sha256(content).hexdigest(), EICAR_SHA256)
        self.assertEqual(hashlib.md5(content).hexdigest(), EICAR_MD5)

    def invoke_scanner(self, eicar_body, eicar_status=200):
        """Mock only credentials/HTTP; keep request, decoding and gates real."""
        self.requests = []
        responses = [
            (200, receipt(verify.CLEAN, "clean")),
            (eicar_status, eicar_body),
            (400, {"error": "content_sha256_mismatch"}),
            (413, {"error": "payload_too_large"}),
            (502, {"error": "scan_engine_indeterminate"}),
        ]

        def urlopen(request, timeout):
            self.requests.append(request)
            status, body = responses[len(self.requests) - 1]
            encoded = json.dumps(body).encode()
            if status >= 400:
                raise urllib.error.HTTPError(
                    request.full_url, status, "mock HTTP error", {}, io.BytesIO(encoded)
                )
            response = MagicMock()
            response.status = status
            response.read.return_value = encoded
            response.__enter__.return_value = response
            return response

        with patch.dict(verify.os.environ, {"SCANNER_ID_TOKEN": "unit-token"}), \
             patch.object(verify.urllib.request, "urlopen", side_effect=urlopen), \
             contextlib.redirect_stdout(io.StringIO()):
            return verify.test_scanner(SCANNER_URL)

    def test_actual_fixture_is_canonical(self):
        self.assert_canonical(verify.EICAR)

    def test_actual_second_post_is_canonical_and_infected_receipt_passes(self):
        # False means hosted-only cases remain UNEXECUTED, not full acceptance.
        self.assertIs(self.invoke_scanner(receipt(verify.EICAR, "infected")), False)
        self.assertEqual(len(self.requests), 5)
        request = self.requests[1]
        self.assert_canonical(request.data)
        self.assertEqual(request.full_url, SCANNER_URL + "/scan")
        self.assertEqual(request.get_method(), "POST")
        headers = {key.lower(): value for key, value in request.header_items()}
        self.assertEqual(headers["x-content-sha256"], EICAR_SHA256)
        self.assertEqual(headers["content-type"], "application/pdf")
        self.assertEqual(headers["authorization"], "Bearer unit-token")
        self.assertEqual(self.requests[0].data, verify.CLEAN)
        self.assertEqual(self.requests[2].data, verify.CLEAN)
        self.assertEqual(self.requests[2].get_header("X-content-sha256"), "0" * 64)
        self.assertEqual(self.requests[3].data, verify.OVERSIZED)
        self.assertEqual(self.requests[4].data, verify.ENGINE_LIMIT_PAYLOAD)

    def test_clean_or_missing_verdict_fails_at_second_post(self):
        for verdict in ("clean", None, "unsupported"):
            with self.subTest(verdict=verdict):
                body = receipt(verify.EICAR, verdict)
                if verdict is None:
                    del body["verdict"]
                with self.assertRaisesRegex(AssertionError, "Expected verdict infected"):
                    self.invoke_scanner(body)
                self.assertEqual(len(self.requests), 2)

    def test_infected_receipt_still_requires_exact_hash_and_size(self):
        for field, value, message in (
            ("sha256", "0" * 64, "Expected sha256"),
            ("sizeBytes", len(verify.EICAR) + 1, "Expected size"),
        ):
            with self.subTest(field=field):
                body = receipt(verify.EICAR, "infected")
                body[field] = value
                with self.assertRaisesRegex(AssertionError, message):
                    self.invoke_scanner(body)
                self.assertEqual(len(self.requests), 2)

    def test_http_errors_cannot_satisfy_infection_gate(self):
        for status, error in ((415, "unsupported_content_type"),
                              (503, "scan_engine_not_ready"),
                              (502, "scan_engine_indeterminate")):
            with self.subTest(status=status):
                with self.assertRaisesRegex(AssertionError, f"Expected 200, got {status}"):
                    self.invoke_scanner({"error": error}, eicar_status=status)
                self.assertEqual(len(self.requests), 2)


if __name__ == "__main__":
    unittest.main()
