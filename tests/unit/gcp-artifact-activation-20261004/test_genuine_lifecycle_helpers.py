import unittest
from unittest.mock import patch, MagicMock
import test_genuine_clamd_lifecycle as harness

class TestGenuineLifecycleHelpers(unittest.TestCase):
    def setUp(self):
        self.mock_monotonic = patch('test_genuine_clamd_lifecycle.time.monotonic').start()
        self.mock_sleep = patch('test_genuine_clamd_lifecycle.time.sleep').start()
        self.mock_run_cmd = patch('test_genuine_clamd_lifecycle.run_cmd').start()
        self.addCleanup(patch.stopall)
        
        # Default clock: starts at 1000, advances by what is requested in sleep
        self.current_time = 1000.0
        def fake_monotonic():
            return self.current_time
        def fake_sleep(n):
            self.current_time += n
        self.mock_monotonic.side_effect = fake_monotonic
        self.mock_sleep.side_effect = fake_sleep
        
        self.container = "test-container"
        self.db_dir = "/var/lib/clamav"

    def _make_res(self, returncode=0, stdout="", stderr=""):
        res = MagicMock()
        res.returncode = returncode
        res.stdout = stdout
        res.stderr = stderr
        return res

    def test_complete_success_immediate(self):
        def run_cmd_side_effect(cmd, **kwargs):
            cmd_str = " ".join(cmd)
            if "ready.version" in cmd_str:
                return self._make_res(stdout="12345\n")
            if "daily.cvd" in cmd_str:
                return self._make_res(stdout="ClamAV-VDB:build time:12345:other\n")
            if "daily.cld" in cmd_str:
                return self._make_res(returncode=1)
            if "stat" in cmd_str and "ready" in cmd_str and "ready." not in cmd_str:
                return self._make_res(stdout="99999\n")
            if "stat" in cmd_str and "daily.cvd" in cmd_str:
                return self._make_res(stdout="88888\n")
            if "zVERSION" in cmd_str:
                return self._make_res(stdout="ClamAV 1.0.0/12345/date\n")
            return self._make_res(returncode=1)
            
        self.mock_run_cmd.side_effect = run_cmd_side_effect
        
        result = harness.poll_genuine_readiness_handshake(self.container, self.db_dir, timeout_s=60)
        self.assertEqual(result["marker_version"], "12345")
        self.assertEqual(result["expected_ref"], "daily.cvd")
        self.assertEqual(result["expected_ref_version"], "12345")

    def test_delayed_full_publication(self):
        # publication at 6s
        self.call_count = 0
        def run_cmd_side_effect(cmd, **kwargs):
            cmd_str = " ".join(cmd)
            elapsed = self.current_time - 1000.0
            
            if "ready.version" in cmd_str:
                if elapsed < 6.0:
                    return self._make_res(returncode=1, stderr="No such file")
                return self._make_res(stdout="123\n")
            if "daily.cvd" in cmd_str:
                if elapsed < 6.0:
                    return self._make_res(returncode=1)
                return self._make_res(stdout="ClamAV-VDB:time:123:other\n")
            if "daily.cld" in cmd_str:
                return self._make_res(returncode=1)
            if "stat" in cmd_str and "ready" in cmd_str and "ready." not in cmd_str:
                if elapsed < 6.0:
                    return self._make_res(returncode=1)
                return self._make_res(stdout="99999\n")
            if "stat" in cmd_str and "daily.cvd" in cmd_str:
                return self._make_res(stdout="88888\n")
            if "zVERSION" in cmd_str:
                if elapsed < 6.0:
                    return self._make_res(stdout="ClamAV 1.0.0/0/date\n")
                return self._make_res(stdout="ClamAV 1.0.0/123/date\n")
            return self._make_res(returncode=1)
            
        self.mock_run_cmd.side_effect = run_cmd_side_effect
        
        result = harness.poll_genuine_readiness_handshake(self.container, self.db_dir, timeout_s=60)
        self.assertEqual(result["marker_version"], "123")
        self.assertTrue(self.current_time >= 1006.0)

    def test_never_ready_timeout(self):
        def run_cmd_side_effect(cmd, **kwargs):
            return self._make_res(returncode=1, stderr="Not found")
            
        self.mock_run_cmd.side_effect = run_cmd_side_effect
        
        with self.assertRaises(TimeoutError) as ctx:
            harness.poll_genuine_readiness_handshake(self.container, self.db_dir, timeout_s=60)
            
        self.assertIn("Readiness handshake incomplete within 60s", str(ctx.exception))
        self.assertIn("missing or unreadable", str(ctx.exception))
        self.assertTrue(self.current_time >= 1060.0)

    def test_mismatched_observations(self):
        def run_cmd_side_effect(cmd, **kwargs):
            cmd_str = " ".join(cmd)
            # Returns numeric marker, readable header, but mismatched zVERSION
            if "ready.version" in cmd_str:
                return self._make_res(stdout="123\n")
            if "daily.cvd" in cmd_str:
                return self._make_res(stdout="ClamAV-VDB:time:123:other\n")
            if "daily.cld" in cmd_str:
                return self._make_res(returncode=1)
            if "stat" in cmd_str and "ready" in cmd_str and "ready." not in cmd_str:
                return self._make_res(stdout="99999\n")
            if "stat" in cmd_str and "daily.cvd" in cmd_str:
                return self._make_res(stdout="88888\n")
            if "zVERSION" in cmd_str:
                return self._make_res(stdout="ClamAV 1.0.0/456/date\n")
            return self._make_res(returncode=1)
            
        self.mock_run_cmd.side_effect = run_cmd_side_effect
        
        with self.assertRaises(TimeoutError) as ctx:
            harness.poll_genuine_readiness_handshake(self.container, self.db_dir, timeout_s=6)
            
        self.assertIn("loaded 456 != marker 123", str(ctx.exception))
        self.assertTrue(self.current_time >= 1006.0)

    def test_invalid_marker_version(self):
        def run_cmd_side_effect(cmd, **kwargs):
            cmd_str = " ".join(cmd)
            if "ready.version" in cmd_str:
                return self._make_res(stdout="invalid\n")
            return self._make_res(returncode=1)
            
        self.mock_run_cmd.side_effect = run_cmd_side_effect
        
        with self.assertRaises(TimeoutError) as ctx:
            harness.poll_genuine_readiness_handshake(self.container, self.db_dir, timeout_s=5)
            
        self.assertIn("ready.version not numeric: invalid", str(ctx.exception))

if __name__ == "__main__":
    unittest.main()
