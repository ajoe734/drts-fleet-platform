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
                elif "database is up-to-date" in cmd[3]:
                    mock_res.stdout = '[{"textPayload": "database is up-to-date (version: 5)"}]'
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



    @patch("sys.argv", ["script", "--document-bucket", "d", "--remittance-bucket", "r", "--scanner-url", "s", "--runtime-sa", "sa", "--scanner-service", "ss", "--project", "p", "--region", "rg"])
    def test_main_rejects_incomplete(self):
        with patch.object(self.mod, "test_scanner") as mock_scanner, \
             patch.object(self.mod, "test_gcs") as mock_gcs:
            mock_scanner.return_value = False
            with self.assertRaises(SystemExit) as cm:
                self.mod.main()
            self.assertEqual(cm.exception.code, 1)


    MUTATED_KEYS = ["MAX_SIGNATURE_AGE_MS", "CLAMD_PORT", "COLD_START_NONCE", "CLAMD_TIMEOUT_MS",
                    "FRESHCLAM_INTERVAL_SECONDS", "http_proxy", "FAULT_INJECT_TRANSPORT"]

    def _make_env_aware_run_side_effect(self, container_env, cold_start_polls, on_update=None):
        """A gcloud double that actually tracks per-container env state,
        instead of returning a fixed canned response regardless of what was
        requested. `on_update` may raise to model a specific update call
        (e.g. the finally-block restore) failing."""
        state = {"revision": 0}

        def side_effect(cmd, *args, **kwargs):
            mock_res = MagicMock()
            mock_res.returncode = 0
            if "describe" in cmd and "--format=value(status.latestCreatedRevisionName)" in cmd:
                mock_res.stdout = f"rev-{state['revision']}"
            elif "describe" in cmd:
                containers = [
                    {"name": name, "env": [{"name": k, "value": v} for k, v in container_env[name].items()]}
                    for name in ("gateway", "clamd")
                ]
                mock_res.stdout = json.dumps({"spec": {"template": {"spec": {"containers": containers}}}})
            elif "update" in cmd and "services" in cmd:
                if on_update:
                    on_update(cmd)
                if not isinstance(getattr(self, "_update_cmds", None), list):
                    self._update_cmds = []
                self._update_cmds.append(list(cmd))
                container = cmd[cmd.index("--container") + 1]
                state["revision"] += 1
                cold_start_polls["n"] = 0
                if "--remove-env-vars" in cmd:
                    for key in cmd[cmd.index("--remove-env-vars") + 1].split(","):
                        container_env[container].pop(key, None)
                if "--update-env-vars" in cmd:
                    for pair in cmd[cmd.index("--update-env-vars") + 1].split(","):
                        key, _, value = pair.partition("=")
                        container_env[container][key] = value
                mock_res.stdout = "ok"
            elif "logging" in cmd and "read" in cmd:
                query = cmd[3]
                current_rev = f"rev-{state['revision']}"
                if f'revision_name="{current_rev}"' in query and "Fetching ClamAV signatures" in query:
                    mock_res.stdout = '[{"textPayload": "Fetching ClamAV signatures"}]'
                elif f'revision_name="{current_rev}"' in query and ("database is up-to-date" in query or "updated (version:" in query):
                    mock_res.stdout = '[{"textPayload": "database is up-to-date (version: 27315, sigs: 1, f-level: 90, builder: test)"}]'
                else:
                    mock_res.stdout = "[]"
            else:
                mock_res.stdout = "[]"
            return mock_res

        return side_effect

    def _make_env_aware_urlopen_side_effect(self, container_env, cold_start_polls):
        """Derives the scanner's HTTP response purely from the currently
        modeled gateway container env, so Test5/6's readiness rejections,
        the cold-start pending->ready transition, and Test9's transport
        fault are each genuinely conditioned on the gcloud state the helper
        itself mutated -- not on an unconditional canned 200 or an
        arbitrary call-count threshold."""
        import io

        def side_effect(req, *args, **kwargs):
            data = getattr(req, "data", b"") or b""
            client_sha256 = req.get_header("X-content-sha256")
            actual_sha256 = self.mod.hashlib.sha256(data).hexdigest()
            size = len(data)

            def http_error(status, error):
                fp = io.BytesIO(json.dumps({"error": error}).encode())
                raise urllib.error.HTTPError(req.full_url, status, error, req.headers, fp)

            if client_sha256 and client_sha256.lower() != actual_sha256.lower():
                http_error(400, "content_sha256_mismatch")
            if size > 10 * 1024 * 1024:
                http_error(413, "payload_too_large")
            if data == self.mod.ENGINE_LIMIT_PAYLOAD:
                http_error(502, "scan_engine_indeterminate")

            gw = container_env["gateway"]
            if gw.get("MAX_SIGNATURE_AGE_MS") == "1":
                http_error(503, "scan_engine_not_ready")
            if gw.get("CLAMD_PORT") == "9999":
                http_error(503, "scan_engine_not_ready")
            if gw.get("COLD_START_NONCE"):
                cold_start_polls["n"] += 1
                if cold_start_polls["n"] <= 2:
                    http_error(503, "scan_engine_not_ready")
            if gw.get("CLAMD_TIMEOUT_MS") == "1":
                http_error(502, "scan_engine_unavailable")

            mock_resp = MagicMock()
            mock_resp.status = 200
            verdict = "clean" if data == self.mod.CLEAN else "infected"
            mock_resp.read.return_value = json.dumps({
                "status": "ready", "verdict": verdict, "sha256": actual_sha256, "sizeBytes": size,
            }).encode()
            mock_cm = MagicMock()
            mock_cm.__enter__.return_value = mock_resp
            return mock_cm

        return side_effect

    @patch("subprocess.run")
    @patch("time.sleep")
    @patch("urllib.request.urlopen")
    @patch("os.environ.get")
    def test_scanner_hosted_full_lifecycle_and_restoration_regression(self, mock_env, mock_urlopen, mock_sleep, mock_run):
        """Regression for R5b.4b: the prior version of this test returned an
        unconditional 200 for every scan, so Test5's readiness-rejection
        assertion (`verify-dev-artifact-backends.py` line 152) failed
        immediately and was silently swallowed by a bare
        `assertRaises(Exception)`, making this test pass green while
        exercising almost none of the real restoration/fault-injection
        logic. This version models the Cloud Run env mutations the helper
        itself issues, so Test5/6's rejections, the cold-start pending
        transition, and Test9's transport fault are each genuinely
        triggered by that state, and the helper is expected to complete
        the full hosted scenario -- including restoring every mutated key
        via --remove-env-vars, since none of them existed beforehand."""
        mock_env.return_value = "fake-token"
        container_env = {"gateway": {}, "clamd": {}}
        cold_start_polls = {"n": 0}
        self._update_cmds = []

        mock_run.side_effect = self._make_env_aware_run_side_effect(container_env, cold_start_polls)
        mock_urlopen.side_effect = self._make_env_aware_urlopen_side_effect(container_env, cold_start_polls)

        result = self.mod.test_scanner("http://fake", scanner_service="s", project="p", region="r")
        self.assertTrue(result, "Expected the full hosted scenario to complete successfully against the env-aware model")

        updates = self._update_cmds

        # Prove the CLAMD_TIMEOUT_MS fault was actually enabled (reached),
        # not merely that some later call happened to look like a restore.
        enable_calls = [
            c for c in updates
            if "--update-env-vars" in c and "CLAMD_TIMEOUT_MS=1" in c[c.index("--update-env-vars") + 1]
        ]
        self.assertTrue(len(enable_calls) > 0, "Expected CLAMD_TIMEOUT_MS=1 to be enabled for Test 9")

        # The finally block must restore via --remove-env-vars (not
        # --update-env-vars to some fabricated placeholder value) for every
        # mutated key, since none of them existed in the original env --
        # this is the "absent" restoration path the broken version of this
        # test never actually reached.
        remove_calls = [c for c in updates if "--remove-env-vars" in c]
        removed_keys = set()
        for c in remove_calls:
            removed_keys.update(c[c.index("--remove-env-vars") + 1].split(","))
        for key in self.MUTATED_KEYS:
            self.assertIn(key, removed_keys, f"Expected {key} to be removed (absent originally) on final cleanup")

        # Final state for both containers must be fully empty again.
        self.assertEqual(container_env["gateway"], {})
        self.assertEqual(container_env["clamd"], {})

    @patch("subprocess.run")
    @patch("time.sleep")
    @patch("urllib.request.urlopen")
    @patch("os.environ.get")
    def test_scanner_hosted_restoration_denial_regression(self, mock_env, mock_urlopen, mock_sleep, mock_run):
        """The finally block's restoration failure path
        (verify-dev-artifact-backends.py lines 283-292, 316-319) must
        surface a `CalledProcessError` from the restore call as a raised
        exception, not swallow it -- a restoration-denial control proving
        the helper never reports a fault-injection run as healthy when the
        service was never actually put back."""
        mock_env.return_value = "fake-token"
        container_env = {"gateway": {}, "clamd": {}}
        cold_start_polls = {"n": 0}

        def deny_full_restore(cmd):
            if "--remove-env-vars" not in cmd:
                return
            keys = set(cmd[cmd.index("--remove-env-vars") + 1].split(","))
            if keys == set(self.MUTATED_KEYS):
                raise subprocess.CalledProcessError(1, cmd, stderr="PERMISSION_DENIED: restore blocked")

        mock_run.side_effect = self._make_env_aware_run_side_effect(container_env, cold_start_polls, on_update=deny_full_restore)
        mock_urlopen.side_effect = self._make_env_aware_urlopen_side_effect(container_env, cold_start_polls)

        with self.assertRaisesRegex(Exception, "Failed to restore scanner config"):
            self.mod.test_scanner("http://fake", scanner_service="s", project="p", region="r")

if __name__ == "__main__":
    unittest.main()
