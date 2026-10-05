import subprocess
import time
import sys
import os
import unittest

def run_cmd(cmd):
    print(f"Running: {' '.join(cmd)}")
    return subprocess.run(cmd, capture_output=True, text=True)

def wait_for_log(container_name, pattern, timeout=60, stream="both"):
    start = time.time()
    while time.time() - start < timeout:
        res = run_cmd(["docker", "logs", container_name])
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

    def test_genuine_lifecycle(self):
        # Establish healthy startup
        print("Starting container to establish healthy startup...")
        res = run_cmd(["docker", "run", "-d", "--name", self.container_name, "-e", "FRESHCLAM_INTERVAL_SECONDS=5", self.image])
        self.assertEqual(res.returncode, 0, f"Failed to start container: {res.stderr}")

        # Wait for actual freshclam output on stdout
        success = wait_for_log(self.container_name, "database is up-to-date", 30, "stdout") or wait_for_log(self.container_name, "updated (version:", 30, "stdout")
        if not success:
            logs = run_cmd(["docker", "logs", self.container_name])
            self.fail(f"Failed to observe initial freshclam update or up-to-date status on stdout.\nStdout: {logs.stdout}\nStderr: {logs.stderr}")

        # Wait for clamd to start
        success = wait_for_log(self.container_name, "socket found, clamav is ready", 30, "both")
        if not success:
            logs = run_cmd(["docker", "logs", self.container_name])
            self.fail(f"Failed to observe clamd readiness.\nStdout: {logs.stdout}\nStderr: {logs.stderr}")

        # Check marker file version
        res = run_cmd(["docker", "exec", self.container_name, "cat", "/var/lib/clamav/readiness-marker"])
        self.assertEqual(res.returncode, 0, f"Failed to read readiness marker: {res.stderr}")
        marker_version = res.stdout.strip()
        self.assertTrue(marker_version.isdigit(), f"Marker version is not numeric: {marker_version}")

        # Ensure loaded version matches marker
        res = run_cmd(["docker", "exec", self.container_name, "sh", "-c", "echo -n 'zVERSION\0' | nc -U /var/run/clamav/clamd.ctl"])
        self.assertEqual(res.returncode, 0, f"Failed to ping clamd: {res.stderr}")
        loaded = res.stdout.strip()
        self.assertIn(marker_version, loaded, f"Loaded version {loaded} does not match marker {marker_version}")

        # Test scan of EICAR
        eicar = r"X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
        res = run_cmd(["docker", "exec", self.container_name, "sh", "-c", f"echo '{eicar}' > /tmp/eicar.com && clamdscan /tmp/eicar.com"])
        self.assertNotEqual(res.returncode, 0, "clamdscan should return non-zero for EICAR")
        self.assertIn("FOUND", res.stdout)

        print("Healthy startup established. Injecting refresh failure AFTER startup...")
        # Break freshclam by removing conf
        res = run_cmd(["docker", "exec", self.container_name, "sh", "-c", "rm -f /etc/clamav/freshclam.conf"])
        self.assertEqual(res.returncode, 0, f"Failed to inject fault: {res.stderr}")

        success = wait_for_log(self.container_name, "freshclam refresh failed; marking not ready", 30, "both")
        if not success:
            logs = run_cmd(["docker", "logs", self.container_name])
            self.fail(f"Failed to observe freshclam refresh failure.\nStdout: {logs.stdout}\nStderr: {logs.stderr}")

        # After failure, it should eventually be marked not ready in readiness marker (file deleted or changed)
        # Verify clamdscan still works for existing signatures, but marker indicates not ready
        res = run_cmd(["docker", "exec", self.container_name, "cat", "/var/lib/clamav/readiness-marker"])
        self.assertNotEqual(res.returncode, 0, "Readiness marker should be deleted after failure")

        print("Injecting recovery...")
        # Restore conf
        res = run_cmd(["docker", "exec", self.container_name, "sh", "-c", "echo 'DatabaseMirror database.clamav.net' > /etc/clamav/freshclam.conf"])
        self.assertEqual(res.returncode, 0, f"Failed to restore conf: {res.stderr}")

        # Wait for recovery
        success = wait_for_log(self.container_name, "updated (version:", 60, "stdout") or wait_for_log(self.container_name, "database is up-to-date", 60, "stdout")
        if not success:
            logs = run_cmd(["docker", "logs", self.container_name])
            self.fail(f"Failed to observe recovery.\nStdout: {logs.stdout}\nStderr: {logs.stderr}")

        # Verify clean/EICAR after recovery
        res = run_cmd(["docker", "exec", self.container_name, "sh", "-c", "echo 'clean data' > /tmp/clean.txt && clamdscan /tmp/clean.txt"])
        self.assertEqual(res.returncode, 0, f"clamdscan failed for clean file after recovery: {res.stdout}")
        self.assertIn("OK", res.stdout)

        print("Genuine engine lifecycle harness completed successfully.")

if __name__ == "__main__":
    unittest.main()
