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
            if "stat" in cmd_str and "ready" in cmd_str and "ready." not in cmd_str:
                return self._make_res(stdout="99999\n")
            if "stat" in cmd_str and "daily.cvd" in cmd_str:
                return self._make_res(stdout="88888\n")
            if "ready.version" in cmd_str:
                return self._make_res(stdout="12345\n")
            if "daily.cvd" in cmd_str:
                return self._make_res(stdout="ClamAV-VDB:build time:12345:other\n")
            if "daily.cld" in cmd_str:
                return self._make_res(returncode=1)
            if "zVERSION" in cmd_str:
                return self._make_res(stdout="ClamAV 1.0.0/12345/date\n")
            return self._make_res(returncode=1)

        self.mock_run_cmd.side_effect = run_cmd_side_effect

        result = harness.poll_genuine_readiness_handshake(self.container, self.db_dir, timeout_s=60)
        self.assertEqual(result["marker_version"], "12345")
        self.assertEqual(result["expected_ref"], "daily.cvd")
        self.assertEqual(result["expected_ref_version"], "12345")
        self.assertEqual(result["daily_mtime"], "88888")
        self.assertEqual(result["marker_mtime"], "99999")

    def test_delayed_full_publication(self):
        # publication at 6s
        self.call_count = 0
        def run_cmd_side_effect(cmd, **kwargs):
            cmd_str = " ".join(cmd)
            elapsed = self.current_time - 1000.0

            if "stat" in cmd_str and "ready" in cmd_str and "ready." not in cmd_str:
                if elapsed < 6.0:
                    return self._make_res(returncode=1)
                return self._make_res(stdout="99999\n")
            if "stat" in cmd_str and "daily.cvd" in cmd_str:
                return self._make_res(stdout="88888\n")
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
            if "stat" in cmd_str and "ready" in cmd_str and "ready." not in cmd_str:
                return self._make_res(stdout="99999\n")
            if "stat" in cmd_str and "daily.cvd" in cmd_str:
                return self._make_res(stdout="88888\n")
            if "ready.version" in cmd_str:
                return self._make_res(stdout="123\n")
            if "daily.cvd" in cmd_str:
                return self._make_res(stdout="ClamAV-VDB:time:123:other\n")
            if "daily.cld" in cmd_str:
                return self._make_res(returncode=1)
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

    def test_fractional_remaining_and_no_commands_after_deadline(self):
        import subprocess
        self.current_time = 0.0
        self.cmd_calls = []

        def run_cmd_side_effect(cmd, **kwargs):
            timeout = kwargs.get('timeout', 10.0)
            self.cmd_calls.append((self.current_time, timeout))
            elapsed = self.current_time
            if elapsed < 58.0:
                # command takes 1.5s but returns not found
                actual_time = min(timeout, 1.5)
                self.current_time += actual_time
                if timeout < 1.5:
                    raise subprocess.TimeoutExpired(cmd, timeout)
                return self._make_res(returncode=1, stderr="Not found")

            # subsequent commands need 1.5s
            if timeout < 1.5:
                self.current_time += timeout
                raise subprocess.TimeoutExpired(cmd, timeout)

            self.current_time += 1.5
            cmd_str = " ".join(cmd)

            if "stat" in cmd_str and "ready" in cmd_str and "ready." not in cmd_str:
                return self._make_res(stdout="100\n")
            if "stat" in cmd_str and "daily.cvd" in cmd_str:
                return self._make_res(stdout="100\n")
            if "ready.version" in cmd_str:
                return self._make_res(stdout="123\n")
            if "daily.cvd" in cmd_str:
                return self._make_res(stdout="ClamAV-VDB:time:123:other\n")
            if "daily.cld" in cmd_str:
                return self._make_res(returncode=1)
            if "zVERSION" in cmd_str:
                return self._make_res(stdout="ClamAV 1.4.6/123/date\n")

            return self._make_res(returncode=1)

        self.mock_run_cmd.side_effect = run_cmd_side_effect

        with self.assertRaises(TimeoutError) as ctx:
            harness.poll_genuine_readiness_handshake(self.container, self.db_dir, timeout_s=60)

        self.assertLessEqual(self.cmd_calls[-1][0], 60.0)
        self.assertEqual(self.current_time, 60.0)

    def test_transient_timeout_recovery(self):
        self.current_time = 0.0
        import subprocess

        def run_cmd_side_effect(cmd, **kwargs):
            timeout = kwargs.get('timeout', 10.0)
            cmd_str = " ".join(cmd)
            elapsed = self.current_time

            if elapsed < 10.0:
                self.current_time += timeout
                raise subprocess.TimeoutExpired(cmd, timeout)

            if "stat" in cmd_str and "ready" in cmd_str and "ready." not in cmd_str:
                return self._make_res(stdout="999\n")
            if "stat" in cmd_str and "daily.cvd" in cmd_str:
                return self._make_res(stdout="888\n")
            if "ready.version" in cmd_str:
                return self._make_res(stdout="123\n")
            if "daily.cvd" in cmd_str:
                return self._make_res(stdout="ClamAV-VDB:time:123:other\n")
            if "daily.cld" in cmd_str:
                return self._make_res(returncode=1)
            if "zVERSION" in cmd_str:
                return self._make_res(stdout="ClamAV 1.0.0/123/date\n")
            return self._make_res(returncode=1)

        self.mock_run_cmd.side_effect = run_cmd_side_effect

        result = harness.poll_genuine_readiness_handshake(self.container, self.db_dir, timeout_s=60)
        self.assertEqual(result["marker_version"], "123")

    def test_staggered_publication(self):
        self.current_time = 0.0

        def run_cmd_side_effect(cmd, **kwargs):
            cmd_str = " ".join(cmd)
            elapsed = self.current_time

            if "stat" in cmd_str and "ready" in cmd_str and "ready." not in cmd_str:
                if elapsed < 6.0:
                    return self._make_res(returncode=1)
                return self._make_res(stdout="999\n")
            if "stat" in cmd_str and "daily.cvd" in cmd_str:
                return self._make_res(stdout="888\n")
            if "ready.version" in cmd_str:
                return self._make_res(stdout="123\n")
            if "daily.cvd" in cmd_str:
                return self._make_res(stdout="ClamAV-VDB:time:123:other\n")
            if "daily.cld" in cmd_str:
                return self._make_res(returncode=1)
            if "zVERSION" in cmd_str:
                if elapsed < 12.0:
                    return self._make_res(stdout="ClamAV 1.0.0/0/date\n")
                return self._make_res(stdout="ClamAV 1.0.0/123/date\n")
            return self._make_res(returncode=1)

        self.mock_run_cmd.side_effect = run_cmd_side_effect

        result = harness.poll_genuine_readiness_handshake(self.container, self.db_dir, timeout_s=60)
        self.assertEqual(result["marker_version"], "123")
        self.assertTrue(self.current_time >= 12.0)

    def test_watchdog_renewal_loop(self):
        import subprocess
        import re
        self.current_time = 0.0

        def run_cmd_side_effect(cmd, **kwargs):
            timeout = kwargs.get('timeout', 10.0)
            elapsed = self.current_time
            cmd_str = " ".join(cmd)

            if elapsed < 2.0:
                self.current_time += timeout
                raise subprocess.TimeoutExpired(cmd, timeout)

            self.current_time += 1.0
            if "stat" in cmd_str and "ready" in cmd_str:
                return self._make_res(stdout="123456\n")
            if "logs" in cmd_str:
                return self._make_res(stdout="Watchdog updated successfully\n")
            return self._make_res(returncode=1)

        self.mock_run_cmd.side_effect = run_cmd_side_effect
        import re
        mtime, logs = harness.poll_genuine_watchdog_renewal(
            "container", "daily.cvd", "123", "123450", "since_time",
            re.compile("Watchdog updated successfully"), "/db", timeout_s=10
        )
        self.assertEqual(mtime, "123456")
        self.assertIn("Watchdog updated", logs)

    def test_marker_removal_loop(self):
        import subprocess
        self.current_time = 0.0

        def run_cmd_side_effect(cmd, **kwargs):
            timeout = kwargs.get('timeout', 10.0)
            elapsed = self.current_time

            if elapsed < 2.0:
                self.current_time += timeout
                raise subprocess.TimeoutExpired(cmd, timeout)

            self.current_time += 1.0
            return self._make_res(returncode=1)

        self.mock_run_cmd.side_effect = run_cmd_side_effect
        removed = harness.poll_genuine_marker_removal("container", timeout_s=10)
        self.assertTrue(removed)

    def test_activation_loop(self):
        import subprocess
        self.current_time = 0.0

        def run_cmd_side_effect(cmd, **kwargs):
            timeout = kwargs.get('timeout', 10.0)
            elapsed = self.current_time

            if elapsed < 2.0:
                self.current_time += timeout
                raise subprocess.TimeoutExpired(cmd, timeout)

            self.current_time += 1.0
            return self._make_res(stdout="ClamAV 1.0.0/789/date\n")

        self.mock_run_cmd.side_effect = run_cmd_side_effect
        activated = harness.poll_genuine_activation("container", "789", timeout_s=10)
        self.assertEqual(activated, "789")

    def test_pending_version_loop(self):
        import subprocess
        self.current_time = 0.0

        def run_cmd_side_effect(cmd, **kwargs):
            timeout = kwargs.get('timeout', 10.0)
            elapsed = self.current_time

            if elapsed < 2.0:
                self.current_time += timeout
                raise subprocess.TimeoutExpired(cmd, timeout)

            self.current_time += 1.0
            return self._make_res(stdout="456\n")

        self.mock_run_cmd.side_effect = run_cmd_side_effect
        ver = harness.poll_genuine_pending_version("container", "123", timeout_s=10)
        self.assertEqual(ver, "456")

    def test_watchdog_renewal_delayed_log(self):
        import subprocess
        import re
        self.current_time = 0.0

        def run_cmd_side_effect(cmd, **kwargs):
            elapsed = self.current_time
            cmd_str = " ".join(cmd)
            self.current_time += 1.0

            if "stat" in cmd_str and "ready" in cmd_str:
                return self._make_res(stdout="123456\n")
            if "logs" in cmd_str:
                if elapsed < 5.0:
                    return self._make_res(stdout="Other logs\n")
                return self._make_res(stdout="Watchdog updated successfully\n")
            return self._make_res(returncode=1)

        self.mock_run_cmd.side_effect = run_cmd_side_effect
        mtime, logs = harness.poll_genuine_watchdog_renewal(
            "container", "daily.cvd", "123", "123450", "since_time",
            re.compile("Watchdog updated successfully"), "/db", timeout_s=10
        )
        self.assertEqual(mtime, "123456")
        self.assertIn("Watchdog updated", logs)
        self.assertGreaterEqual(self.current_time, 5.0)

    def test_watchdog_renewal_late_success_rejected(self):
        import subprocess
        import re
        self.current_time = 0.0

        def run_cmd_side_effect(cmd, **kwargs):
            self.current_time += 0.5
            cmd_str = " ".join(cmd)
            if "stat" in cmd_str:
                return self._make_res(stdout="123456\n")
            if "logs" in cmd_str:
                return self._make_res(stdout="Watchdog updated successfully\n")
            return self._make_res(returncode=1)

        self.mock_run_cmd.side_effect = run_cmd_side_effect
        with self.assertRaisesRegex(TimeoutError, "Renewal loop incomplete"):
            harness.poll_genuine_watchdog_renewal(
                "container", "daily.cvd", "123", "123450", "since_time",
                re.compile("Watchdog updated successfully"), "/db", timeout_s=1
            )

    def test_marker_removal_late_success_rejected(self):
        import subprocess
        self.current_time = 0.0

        def run_cmd_side_effect(cmd, **kwargs):
            self.current_time += 0.5
            return self._make_res(returncode=1) # Missing file implies removed

        self.mock_run_cmd.side_effect = run_cmd_side_effect
        with self.assertRaisesRegex(TimeoutError, "Removal loop incomplete"):
            harness.poll_genuine_marker_removal("container", timeout_s=1)
        self.assertEqual(self.mock_run_cmd.call_count, 2)

    def test_activation_late_success_rejected(self):
        import subprocess
        self.current_time = 0.0

        def run_cmd_side_effect(cmd, **kwargs):
            self.current_time += 1.0
            return self._make_res(stdout="ClamAV 1.0.0/789/date\n")

        self.mock_run_cmd.side_effect = run_cmd_side_effect
        with self.assertRaisesRegex(TimeoutError, "Activation loop incomplete"):
            harness.poll_genuine_activation("container", "789", timeout_s=1)

    def test_pending_version_late_success_rejected(self):
        import subprocess
        self.current_time = 0.0

        def run_cmd_side_effect(cmd, **kwargs):
            self.current_time += 1.0
            return self._make_res(stdout="456\n")

        self.mock_run_cmd.side_effect = run_cmd_side_effect
        with self.assertRaisesRegex(TimeoutError, "Pending loop incomplete"):
            harness.poll_genuine_pending_version("container", "123", timeout_s=1)

if __name__ == "__main__":

    unittest.main()
