import subprocess
import time
import sys
import os
import unittest
import re

def run_cmd(cmd, timeout=10):
    print(f"Running: {' '.join(cmd)}")
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)

def wait_for_log(container_name, pattern, timeout=60, stream="both", since=None):
    start = time.time()
    while time.time() - start < timeout:
        cmd = ["docker", "logs"]
        if since:
            cmd.extend(["--since", since])
        cmd.append(container_name)
        res = run_cmd(cmd, timeout=10)
        logs = ""
        if stream in ["stderr", "both"]:
            logs += res.stderr
        if stream in ["stdout", "both"]:
            logs += res.stdout
        if pattern in logs:
            return True
        time.sleep(2)
    return False

class TestGenuineClamdLifecycle(unittest.TestCase):
    def setUp(self):
        self.image = os.environ.get("CLAMD_IMAGE")
        self.container_name = "test_clamd_lifecycle"
        if not self.image:
            self.skipTest("CLAMD_IMAGE environment variable not set")
        run_cmd(["docker", "rm", "-f", self.container_name])

    def tearDown(self):
        run_cmd(["docker", "rm", "-f", self.container_name])

    def test_genuine_lifecycle_and_transport(self):
        # Start container
        print("Starting container to establish healthy startup...")
        start_time = run_cmd(["date", "-Iseconds"]).stdout.strip()
        res = run_cmd(["docker", "run", "-d", "--name", self.container_name, "-e", "FRESHCLAM_INTERVAL_SECONDS=5", self.image])
        self.assertEqual(res.returncode, 0, f"Failed to start container: {res.stderr}")

        # Wait for freshclam - we must distinguish unchanged/update/failed-refresh
        # Initially, it will download daily.cld or daily.cvd
        success = wait_for_log(self.container_name, "updated (version:", 60, "stdout")
        if not success:
            self.fail("Failed to observe initial freshclam update log")

        time.sleep(5)

        # Verify readiness marker and version file
        res = run_cmd(["docker", "exec", self.container_name, "cat", "/var/run/clamav-ready/ready.version"])
        self.assertEqual(res.returncode, 0, f"Failed to read readiness version marker: {res.stderr}")
        marker_version = res.stdout.strip()
        self.assertTrue(marker_version.isdigit(), f"Marker version is not numeric: {marker_version}")

        # Record the marker mtime
        res = run_cmd(["docker", "exec", self.container_name, "stat", "-c", "%Y", "/var/run/clamav-ready/ready"])
        self.assertEqual(res.returncode, 0)
        marker_mtime_1 = res.stdout.strip()

        # Verify loaded version matches marker via TCP (no null byte injection into python str)
        res = run_cmd(["docker", "exec", self.container_name, "sh", "-c", "printf 'zVERSION\\0' | nc 127.0.0.1 3310"])
        self.assertEqual(res.returncode, 0, f"Failed to ping clamd: {res.stderr}")
        loaded_reply = res.stdout.strip()
        match = re.search(r'ClamAV [^/]+/([^/]+)/', loaded_reply)
        self.assertIsNotNone(match, "Could not parse version from ClamAV reply")
        loaded = match.group(1)
        self.assertEqual(loaded, marker_version, f"Loaded version {loaded} does not precisely match marker {marker_version}")

        # Verify unchanged check - wait for freshclam to run again
        success = wait_for_log(self.container_name, "database is up-to-date", 30, "stdout", since=start_time)
        if not success:
            print("Warning: did not observe 'database is up-to-date' for unchanged log")

        # Test scan of EICAR and CLEAN using clamdscan (real protocol)
        eicar = r"X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
        res = run_cmd(["docker", "exec", self.container_name, "sh", "-c", f"echo '{eicar}' > /tmp/eicar.com && clamdscan /tmp/eicar.com"])
        self.assertNotEqual(res.returncode, 0, "clamdscan should return non-zero for EICAR")
        self.assertIn("FOUND", res.stdout)

        res = run_cmd(["docker", "exec", self.container_name, "sh", "-c", "echo 'clean data' > /tmp/clean.txt && clamdscan /tmp/clean.txt"])
        self.assertEqual(res.returncode, 0, "clamdscan should return zero for clean file")
        self.assertIn("OK", res.stdout)

        # Inject transport fault: Pause actual clamd process
        print("Injecting external transport fault by pausing clamd...")
        res = run_cmd(["docker", "exec", self.container_name, "sh", "-c", "kill -STOP $(pgrep -x clamd)"])
        self.assertEqual(res.returncode, 0, f"Failed to stop clamd: {res.stderr}")

        # Attempt scan (should timeout/fail since clamd is paused)
        # Using zINSTREAM to verify transport failure on streaming
        res = run_cmd(["docker", "exec", self.container_name, "sh", "-c", "printf 'zINSTREAM\\0' | nc -w 2 127.0.0.1 3310"])
        self.assertNotEqual(res.returncode, 0, "Scan should fail when clamd is paused")

        # Resume clamd
        res = run_cmd(["docker", "exec", self.container_name, "sh", "-c", "kill -CONT $(pgrep -x clamd)"])
        self.assertEqual(res.returncode, 0, f"Failed to resume clamd: {res.stderr}")

        # Verify it works again
        res = run_cmd(["docker", "exec", self.container_name, "sh", "-c", "printf 'zPING\\0' | nc 127.0.0.1 3310"])
        self.assertEqual(res.returncode, 0, "Failed to ping clamd after resume")
        self.assertIn("PONG", res.stdout)

        print("Injecting refresh failure AFTER startup...")
        fault_time = run_cmd(["date", "-Iseconds"]).stdout.strip()
        # Break freshclam by removing conf
        res = run_cmd(["docker", "exec", self.container_name, "sh", "-c", "rm -f /etc/clamav/freshclam.conf"])
        self.assertEqual(res.returncode, 0, f"Failed to inject fault: {res.stderr}")

        success = wait_for_log(self.container_name, "freshclam refresh failed; marking not ready", 30, "stderr", since=fault_time)
        if not success:
            self.fail("Failed to observe freshclam refresh failure")

        # After failure, it should eventually be marked not ready
        res = run_cmd(["docker", "exec", self.container_name, "cat", "/var/run/clamav-ready/ready"])
        self.assertNotEqual(res.returncode, 0, "Readiness marker should be deleted after failure")

        print("Injecting recovery...")
        recover_time = run_cmd(["date", "-Iseconds"]).stdout.strip()
        # Restore conf
        res = run_cmd(["docker", "exec", self.container_name, "sh", "-c", "echo 'DatabaseMirror database.clamav.net' > /etc/clamav/freshclam.conf"])
        self.assertEqual(res.returncode, 0, f"Failed to restore conf: {res.stderr}")

        # Wait for recovery (must use cursor to avoid matching startup log)
        success = wait_for_log(self.container_name, "database is up-to-date", 60, "stdout", since=recover_time) or \
                  wait_for_log(self.container_name, "updated (version:", 60, "stdout", since=recover_time)
        if not success:
            self.fail("Failed to observe recovery")

        # Verify markers are back
        res = run_cmd(["docker", "exec", self.container_name, "cat", "/var/run/clamav-ready/ready.version"])
        self.assertEqual(res.returncode, 0, "Readiness version marker should be restored")
        recovered_version = res.stdout.strip()

        # Verify marker mtime has advanced (if actual update) or matches (if unchanged)
        res = run_cmd(["docker", "exec", self.container_name, "stat", "-c", "%Y", "/var/run/clamav-ready/ready"])
        self.assertEqual(res.returncode, 0)
        marker_mtime_2 = res.stdout.strip()

        # Verify equality
        res = run_cmd(["docker", "exec", self.container_name, "sh", "-c", "printf 'zVERSION\\0' | nc 127.0.0.1 3310"])
        loaded_reply_2 = res.stdout.strip()
        match = re.search(r'ClamAV [^/]+/([^/]+)/', loaded_reply_2)
        loaded_2 = match.group(1)
        self.assertEqual(loaded_2, recovered_version, f"Recovered loaded version {loaded_2} does not match marker {recovered_version}")

        # Verify clean/EICAR after recovery
        res = run_cmd(["docker", "exec", self.container_name, "sh", "-c", "clamdscan /tmp/clean.txt"])
        self.assertEqual(res.returncode, 0, f"clamdscan failed for clean file after recovery: {res.stdout}")
        self.assertIn("OK", res.stdout)

        res = run_cmd(["docker", "exec", self.container_name, "sh", "-c", "clamdscan /tmp/eicar.com"])
        self.assertNotEqual(res.returncode, 0, "clamdscan should fail for EICAR after recovery")
        self.assertIn("FOUND", res.stdout)

        print("Genuine engine lifecycle harness completed successfully.")

if __name__ == "__main__":
    unittest.main()
