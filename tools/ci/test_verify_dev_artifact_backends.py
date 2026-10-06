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
            (200, {"sha256": self.mod.hashlib.sha256(self.mod.CLEAN).hexdigest(), "sizeBytes": len(self.mod.CLEAN), "verdict": "clean"}), # Test 9 readiness poll
            (502, {"error": "scan_engine_unavailable"}), # Test 9 large payload transport failure
            (503, {"error": "scan_engine_not_ready"}), # Test 10 failed refresh
            (200, {"sha256": self.mod.hashlib.sha256(self.mod.CLEAN).hexdigest(), "sizeBytes": len(self.mod.CLEAN), "verdict": "clean"}), # Test 10 successful refresh
            (200, {"sha256": self.mod.hashlib.sha256(self.mod.CLEAN).hexdigest(), "sizeBytes": len(self.mod.CLEAN), "verdict": "clean"}), # finally polling readiness
            (200, {"sha256": self.mod.hashlib.sha256(self.mod.CLEAN).hexdigest(), "sizeBytes": len(self.mod.CLEAN), "verdict": "clean"}), # finally scan CLEAN
            (200, {"sha256": self.mod.hashlib.sha256(self.mod.EICAR).hexdigest(), "sizeBytes": len(self.mod.EICAR), "verdict": "infected"}) # finally scan EICAR
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

        def run_side_effect(cmd, *args, **kwargs):
            mock_res = MagicMock()
            mock_res.returncode = 0
            if "describe" in cmd and "services" in cmd:
                if "--format=value(status.latestCreatedRevisionName)" in cmd:
                    mock_res.stdout = "rev-123"
                else:
                    mock_res.stdout = json.dumps([{
                        "spec": {
                            "template": {
                                "spec": {
                                    "containers": [
                                        {"name": "gateway", "env": [{"name": "MAX_SIGNATURE_AGE_MS", "value": "old_age"}, {"name": "CLAMD_PORT", "value": "3310"}]},
                                        {"name": "clamd", "env": [{"name": "FRESHCLAM_INTERVAL_SECONDS", "value": "old_interval"}, {"name": "http_proxy", "value": "old_proxy"}]}
                                    ]
                                }
                            }
                        }
                    }])
            elif "update" in cmd and "services" in cmd:
                # Capture updates for verification
                if not isinstance(getattr(mock_run, "update_cmds", None), list): mock_run.update_cmds = []
                mock_run.update_cmds.append(cmd)
                mock_res.stdout = "ok"
            elif "logging" in cmd and "read" in cmd:
                if "Fetching ClamAV signatures" in cmd[3]:
                    mock_res.stdout = '[{"textPayload": "Fetching ClamAV signatures"}]'
                elif "freshclam refresh failed" in cmd[3]:
                    mock_res.stdout = '[{"textPayload": "freshclam refresh failed; marking not ready"}]'
                elif "daily.cvd database is up-to-date" in cmd[3] or "daily.cld database is up-to-date" in cmd[3] or "daily.cld updated (version:" in cmd[3] or "daily.cvd updated (version:" in cmd[3]:
                    mock_res.stdout = '[{"textPayload": "daily.cvd database is up-to-date (version: 5, sigs: 1234, f-level: 90, builder: tests)"}]'
                else:
                    mock_res.stdout = '[]'
            else:
                mock_res.stdout = '[]'
            return mock_res

        mock_run.side_effect = run_side_effect

        self.mod.test_scanner("http://fake", scanner_service="s", project="p", region="r")

        # Verify container targeting
        updates = getattr(mock_run, "update_cmds", [])
        gateway_updates = [c for c in updates if "--container" in c and "gateway" in c[c.index("--container") + 1]]
        clamd_updates = [c for c in updates if "--container" in c and "clamd" in c[c.index("--container") + 1]]
        self.assertGreater(len(gateway_updates), 0, "No gateway container updates found")
        self.assertGreater(len(clamd_updates), 0, "No clamd container updates found")

        # Verify restoration exact match
        final_gateway_update = gateway_updates[-1]
        final_clamd_update = clamd_updates[-1]
        self.assertIn("--update-env-vars", final_gateway_update)
        # Should restore MAX_SIGNATURE_AGE_MS=old_age and CLAMD_PORT=3310
        idx = final_gateway_update.index("--update-env-vars")
        self.assertIn("MAX_SIGNATURE_AGE_MS=old_age", final_gateway_update[idx+1])
        self.assertIn("CLAMD_PORT=3310", final_gateway_update[idx+1])

        idx2 = final_clamd_update.index("--update-env-vars")
        self.assertIn("FRESHCLAM_INTERVAL_SECONDS=old_interval", final_clamd_update[idx2+1])
        self.assertIn("http_proxy=old_proxy", final_clamd_update[idx2+1])




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
                if "--access-token-file=/dev/null" in cmd:
                    err = subprocess.CalledProcessError(1, cmd, stderr="401 Unauthorized")
                    raise err
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

            elif "cp" in cmd and "--access-token-file=/dev/null" in cmd:
                err = subprocess.CalledProcessError(1, cmd, stderr="401 Unauthorized")
                raise err

            return res

        mock_run.side_effect = side_effect
        result = self.mod.test_gcs("fake-bucket", "fake-sa")
        self.assertTrue(result, "test_gcs should return True when all scenarios pass")

    @patch("sys.argv", ["script", "--document-bucket", "d", "--remittance-bucket", "r", "--scanner-url", "s", "--runtime-sa", "sa", "--scanner-service", "ss", "--project", "p", "--region", "rg"])
    def test_main(self):
        with patch.object(self.mod, "test_scanner") as mock_scanner, \
             patch.object(self.mod, "test_gcs") as mock_gcs:
            mock_scanner.return_value = True
            mock_gcs.return_value = True
            self.mod.main()
            mock_scanner.assert_called_once_with("s", "ss", "p", "rg")
            mock_gcs.assert_any_call("d", "sa")
            mock_gcs.assert_any_call("r", "sa")

    @patch("sys.argv", ["script", "--document-bucket", "d", "--remittance-bucket", "r", "--scanner-url", "s", "--runtime-sa", "sa", "--scanner-service", "ss", "--project", "p", "--region", "rg"])
    def test_main_rejects_incomplete(self):
        with patch.object(self.mod, "test_scanner") as mock_scanner, \
             patch.object(self.mod, "test_gcs") as mock_gcs:
            mock_scanner.return_value = True
            mock_gcs.side_effect = [True, False]
            with self.assertRaises(SystemExit) as cm:
                self.mod.main()
            self.assertEqual(cm.exception.code, 1)


    @patch("subprocess.run")
    @patch("time.sleep")
    @patch("urllib.request.urlopen")
    @patch("os.environ.get")
    def test_scanner_hosted_restoration_regression(self, mock_env, mock_urlopen, mock_sleep, mock_run):
        mock_env.return_value = "fake-token"

        # Env tracking state
        env_state = {}
        cold_start_calls = [0]
        current_nonce = [None]

        def mock_run_side_effect(cmd, *args, **kwargs):
            mock_res = MagicMock()
            mock_res.stdout = "fake-output\n"
            mock_res.returncode = 0
            if "describe" in cmd:
                mock_res.stdout = '{"spec": {"template": {"spec": {"containers": [{"name": "gateway", "env": []}, {"name": "clamd", "env": []}]}}}}'
            elif "logging" in cmd:
                mock_res.stdout = '[{"textPayload": "database is up-to-date (version: 27315)"}]'
            elif "update" in cmd:
                # Track env updates
                if "--update-env-vars" in cmd:
                    idx = cmd.index("--update-env-vars")
                    env_str = cmd[idx+1]
                    for kv in env_str.split(","):
                        k, v = kv.split("=")
                        env_state[k] = v
                        if k == "COLD_START_NONCE":
                            if v != current_nonce[0]:
                                current_nonce[0] = v
                                cold_start_calls[0] = 3 # Return 503 for 3 calls
                elif "--remove-env-vars" in cmd:
                    idx = cmd.index("--remove-env-vars")
                    env_str = cmd[idx+1]
                    for k in env_str.split(","):
                        env_state[k] = None
            return mock_res

        mock_run.side_effect = mock_run_side_effect

        def mock_urlopen_side_effect(req, *args, **kwargs):
            import urllib.error
            import io
            import json

            client_sha256 = req.get_header("X-content-sha256")

            data = getattr(req, "data", b"")
            actual_sha256 = self.mod.hashlib.sha256(data).hexdigest() if data else ""
            size = len(data) if data else 0

            # Test 3: Hash mismatch
            if client_sha256 and client_sha256.lower() != actual_sha256.lower():
                fp = io.BytesIO(json.dumps({"error": "content_sha256_mismatch"}).encode())
                raise urllib.error.HTTPError(req.full_url, 400, "Bad Request", req.headers, fp)

            # Test 4: Oversized (11MB)
            if size > 10 * 1024 * 1024:
                # 413 or 502 based on payload type
                if data == self.mod.ENGINE_LIMIT_PAYLOAD:
                    fp = io.BytesIO(json.dumps({"error": "scan_engine_indeterminate"}).encode())
                    raise urllib.error.HTTPError(req.full_url, 502, "Bad Gateway", req.headers, fp)
                fp = io.BytesIO(json.dumps({"error": "payload_too_large"}).encode())
                raise urllib.error.HTTPError(req.full_url, 413, "Payload Too Large", req.headers, fp)
            
            # Test 9: Transport failure due to short timeout and large (9MB) payload
            if env_state.get("CLAMD_TIMEOUT_MS") == "150" and size > 8 * 1024 * 1024:
                fp = io.BytesIO(json.dumps({"error": "scan_engine_unavailable"}).encode())
                raise urllib.error.HTTPError(req.full_url, 502, "Bad Gateway", req.headers, fp)


            # Test 4: Oversized file
            if size > 10 * 1024 * 1024:
                fp = io.BytesIO(json.dumps({"error": "payload_too_large"}).encode())
                raise urllib.error.HTTPError(req.full_url, 413, "Payload Too Large", req.headers, fp)

            # Test 4b: Engine-limit rejection
            if data == self.mod.ENGINE_LIMIT_PAYLOAD:
                fp = io.BytesIO(json.dumps({"error": "scan_engine_indeterminate"}).encode())
                raise urllib.error.HTTPError(req.full_url, 502, "Bad Gateway", req.headers, fp)

            # Test 5: Stale signature rejection
            if env_state.get("MAX_SIGNATURE_AGE_MS") == "1":
                fp = io.BytesIO(json.dumps({"error": "scan_engine_not_ready"}).encode())
                raise urllib.error.HTTPError(req.full_url, 503, "Service Unavailable", req.headers, fp)

            # Test 6: Unavailable port
            if env_state.get("CLAMD_PORT") == "9999":
                fp = io.BytesIO(json.dumps({"error": "scan_engine_not_ready"}).encode())
                raise urllib.error.HTTPError(req.full_url, 503, "Service Unavailable", req.headers, fp)

            # Test 7/8: Cold start injection
            if cold_start_calls[0] > 0:
                cold_start_calls[0] -= 1
                fp = io.BytesIO(json.dumps({"error": "scan_engine_not_ready"}).encode())
                raise urllib.error.HTTPError(req.full_url, 503, "Service Unavailable", req.headers, fp)

            # Test 10: Failed refresh
            if env_state.get("http_proxy") == "http://127.0.0.1:9999":
                fp = io.BytesIO(json.dumps({"error": "scan_engine_not_ready"}).encode())
                raise urllib.error.HTTPError(req.full_url, 503, "Service Unavailable", req.headers, fp)

            # Normal path
            mock_resp = MagicMock()
            mock_resp.status = 200
            verdict = "clean" if data == self.mod.CLEAN else "infected"
            mock_resp.read.return_value = json.dumps({
                "status": "ready",
                "verdict": verdict,
                "sha256": actual_sha256,
                "sizeBytes": size
            }).encode()
            mock_cm = MagicMock()
            mock_cm.__enter__.return_value = mock_resp
            return mock_cm

        mock_urlopen.side_effect = mock_urlopen_side_effect

        self.mod.test_scanner("http://fake", scanner_service="s", project="p", region="r")

if __name__ == "__main__":
    unittest.main()
