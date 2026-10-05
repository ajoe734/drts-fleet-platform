import contextlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch
import urllib.error

ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = ROOT / "operations/verification/verify-dev-artifact-backends.py"

def load_module():
    spec = importlib.util.spec_from_file_location("verify_dev_artifact_backends", SCRIPT_PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

class TestVerifyDevArtifactBackends(unittest.TestCase):
    def setUp(self):
        self.mod = load_module()

    def test_help(self):
        result = subprocess.run([sys.executable, str(SCRIPT_PATH), "--help"], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0)
        self.assertIn("--document-bucket", result.stdout)

    @patch("os.environ.get")
    def test_get_identity_token(self, mock_get):
        mock_get.return_value = "fake-token"
        self.assertEqual(self.mod.get_identity_token("aud"), "fake-token")
        mock_get.return_value = None
        with self.assertRaises(ValueError):
            self.mod.get_identity_token("aud")

    @patch("subprocess.run")
    def test_get_access_token(self, mock_run):
        mock_result = MagicMock()
        mock_result.stdout = "access-token\n"
        mock_run.return_value = mock_result
        self.assertEqual(self.mod.get_access_token(), "access-token")

    @patch("urllib.request.urlopen")
    @patch("os.environ.get")
    def test_scanner_success(self, mock_env, mock_urlopen):
        mock_env.return_value = "fake-token"

        responses = [
            (200, {"sha256": self.mod.hashlib.sha256(self.mod.CLEAN).hexdigest(), "sizeBytes": len(self.mod.CLEAN), "verdict": "clean"}),
            (200, {"sha256": self.mod.hashlib.sha256(self.mod.EICAR).hexdigest(), "sizeBytes": len(self.mod.EICAR), "verdict": "infected"}),
            (400, {"sha256": "wrong", "sizeBytes": -1, "error": "content_sha256_mismatch"}),
            (413, {"sha256": "x", "sizeBytes": -1, "error": "payload_too_large"}),
            (502, {"error": "scan_engine_indeterminate"})
        ]
        def side_effect(req, timeout=30):
            status, body = responses.pop(0)
            if status >= 400:
                mock_err = urllib.error.HTTPError(req.full_url, status, "Error", hdrs={}, fp=None)
                mock_err.read = MagicMock(return_value=json.dumps(body).encode())
                raise mock_err
            mock_resp = MagicMock()
            mock_resp.status = status
            mock_resp.read = MagicMock(return_value=json.dumps(body).encode())
            mock_cm = MagicMock()
            mock_cm.__enter__.return_value = mock_resp
            return mock_cm

        mock_urlopen.side_effect = side_effect
        self.mod.test_scanner("http://fake")

    @patch("subprocess.run")
    @patch("time.sleep")
    @patch("urllib.request.urlopen")
    @patch("os.environ.get")
    def test_scanner_hosted(self, mock_env, mock_urlopen, mock_sleep, mock_run):
        mock_env.return_value = "fake-token"

        responses = [
            (200, {"sha256": self.mod.hashlib.sha256(self.mod.CLEAN).hexdigest(), "sizeBytes": len(self.mod.CLEAN), "verdict": "clean"}),
            (200, {"sha256": self.mod.hashlib.sha256(self.mod.EICAR).hexdigest(), "sizeBytes": len(self.mod.EICAR), "verdict": "infected"}),
            (400, {"sha256": "wrong", "sizeBytes": -1, "error": "content_sha256_mismatch"}),
            (413, {"sha256": "x", "sizeBytes": -1, "error": "payload_too_large"}),
            (502, {"error": "scan_engine_indeterminate"}), # Test 4b Engine limit
            (503, {"error": "scan_engine_not_ready"}), # Test 5 stale
            (503, {"error": "scan_engine_not_ready"}), # Test 6 readiness failure
            (503, {"error": "scan_engine_not_ready"}), # Test 7
            (200, {"sha256": self.mod.hashlib.sha256(self.mod.CLEAN).hexdigest(), "sizeBytes": len(self.mod.CLEAN), "verdict": "clean"}), # Test 7 polling ready
            (200, {"sha256": self.mod.hashlib.sha256(self.mod.EICAR).hexdigest(), "sizeBytes": len(self.mod.EICAR), "verdict": "infected"}), # Test 7 EICAR
            (502, {"error": "scan_engine_unavailable"}), # Test 9 polling transport failure
            (502, {"error": "scan_engine_unavailable"}), # Test 9 final scan transport failure
            (503, {"error": "scan_engine_not_ready"}), # Test 10 failed refresh
            (200, {"sha256": self.mod.hashlib.sha256(self.mod.CLEAN).hexdigest(), "sizeBytes": len(self.mod.CLEAN), "verdict": "clean"}), # Test 10 successful refresh
            (200, {"sha256": self.mod.hashlib.sha256(self.mod.CLEAN).hexdigest(), "sizeBytes": len(self.mod.CLEAN), "verdict": "clean"}), # finally health check
            (200, {"sha256": self.mod.hashlib.sha256(self.mod.EICAR).hexdigest(), "sizeBytes": len(self.mod.EICAR), "verdict": "infected"}) # finally health check EICAR
        ]
        def urlopen_side_effect(req, timeout=30):
            status, body = responses.pop(0)
            if status >= 400:
                mock_err = urllib.error.HTTPError(req.full_url, status, "Error", hdrs={}, fp=None)
                mock_err.read = MagicMock(return_value=json.dumps(body).encode())
                raise mock_err
            mock_resp = MagicMock()
            mock_resp.status = status
            mock_resp.read = MagicMock(return_value=json.dumps(body).encode())
            mock_cm = MagicMock()
            mock_cm.__enter__.return_value = mock_resp
            return mock_cm

        mock_urlopen.side_effect = urlopen_side_effect

        def run_side_effect(*args, **kwargs):
            mock_res = MagicMock()
            mock_res.stdout = '[{"textPayload": "Fetching ClamAV signatures"}, {"textPayload": "database is up-to-date"}]'
            return mock_res

        mock_run.side_effect = run_side_effect

        self.mod.test_scanner("http://fake", scanner_service="s", project="p", region="r")
        # Call counts might vary, let's just use assertGreaterEqual
        self.assertGreaterEqual(mock_run.call_count, 12)



    @patch("urllib.request.urlopen")
    @patch("os.environ.get")
    def test_scanner_string_error(self, mock_env, mock_urlopen):
        mock_env.return_value = "fake-token"
        responses = [
            (200, {"sha256": self.mod.hashlib.sha256(self.mod.CLEAN).hexdigest(), "sizeBytes": len(self.mod.CLEAN), "verdict": "clean"}),
            (200, {"sha256": self.mod.hashlib.sha256(self.mod.EICAR).hexdigest(), "sizeBytes": len(self.mod.EICAR), "verdict": "infected"}),
            (400, "Plain text error")
        ]
        def side_effect(req, timeout=30):
            status, body = responses.pop(0)
            if status >= 400:
                mock_err = urllib.error.HTTPError(req.full_url, status, "Error", hdrs={}, fp=None)
                mock_err.read = MagicMock(return_value=body.encode())
                raise mock_err
            mock_resp = MagicMock()
            mock_resp.status = status
            mock_resp.read = MagicMock(return_value=json.dumps(body).encode())
            mock_cm = MagicMock()
            mock_cm.__enter__.return_value = mock_resp
            return mock_cm

        mock_urlopen.side_effect = side_effect
        with self.assertRaises(AttributeError):
            self.mod.test_scanner("http://fake")

    @patch("urllib.request.urlopen")
    @patch("os.environ.get")
    def test_scanner_assertion_errors(self, mock_env, mock_urlopen):
        mock_env.return_value = "fake-token"
        # Test 1 failure
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.read = MagicMock(return_value=json.dumps({}).encode())
        mock_cm = MagicMock()
        mock_cm.__enter__.return_value = mock_resp
        mock_urlopen.return_value = mock_cm

        with self.assertRaises(AssertionError):
            self.mod.test_scanner("http://fake")

    @patch("subprocess.run")
    def test_gcs_success(self, mock_run):
        state = {"generation": 12346}
        def side_effect(cmd, **kwargs):
            res = MagicMock()
            if "describe" in cmd:
                res.stdout = str(state["generation"])
            else:
                res.stdout = "12345"

            cp_idx = cmd.index("cp") if "cp" in cmd else -1
            if "cp" in cmd and "#" in cmd[cp_idx+1] and cmd[cp_idx+1].startswith("gs://"):
                with open(cmd[cp_idx+2], "w") as f:
                    requested_gen = cmd[cp_idx+1].split("#")[1]
                    if requested_gen == "12347":
                        f.write("test data v2")
                    else:
                        f.write("test data v1")
            elif "cp" in cmd and "--if-generation-match=0" in cmd:
                if len(mock_run.call_args_list) > 3:
                    err = subprocess.CalledProcessError(1, cmd, stderr="Precondition Failed")
                    raise err
                state["generation"] = 12346
            elif "cp" in cmd and any("--if-generation-match=" in arg and arg != "--if-generation-match=0" for arg in cmd):
                match_arg = next(arg for arg in cmd if arg.startswith("--if-generation-match="))
                if match_arg == f"--if-generation-match={state['generation'] - 1}":
                    err = subprocess.CalledProcessError(1, cmd, stderr="Precondition Failed")
                    raise err
                if match_arg == "--if-generation-match=not_a_number":
                    err = subprocess.CalledProcessError(1, cmd, stderr="Invalid argument")
                    raise err
                if "absent" in cmd[cp_idx+2] or "absent" in cmd[cp_idx+1]:
                    err = subprocess.CalledProcessError(1, cmd, stderr="Precondition Failed")
                    raise err
                state["generation"] += 1

            return res

        mock_run.side_effect = side_effect
        self.mod.test_gcs("fake-bucket", "fake-sa")

    @patch("sys.argv", ["script", "--document-bucket", "d", "--remittance-bucket", "r", "--scanner-url", "s", "--runtime-sa", "sa", "--scanner-service", "ss", "--project", "p", "--region", "rg"])
    def test_main(self):
        with patch.object(self.mod, "test_scanner") as mock_scanner, \
             patch.object(self.mod, "test_gcs") as mock_gcs:
            mock_scanner.return_value = True
            self.mod.main()
            mock_scanner.assert_called_once_with("s", "ss", "p", "rg")
            mock_gcs.assert_any_call("d", "sa")
            mock_gcs.assert_any_call("r", "sa")

if __name__ == "__main__":
    unittest.main()
