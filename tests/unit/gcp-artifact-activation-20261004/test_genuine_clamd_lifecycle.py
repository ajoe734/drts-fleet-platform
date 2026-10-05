import subprocess
import time
import sys

def run_cmd(cmd):
    print(f"Running: {' '.join(cmd)}")
    return subprocess.run(cmd, capture_output=True, text=True)

def wait_for_log(container_name, pattern, timeout=60):
    start = time.time()
    while time.time() - start < timeout:
        logs = run_cmd(["docker", "logs", container_name]).stderr
        if pattern in logs:
            return True
        time.sleep(2)
    return False

import unittest

class TestGenuineClamdLifecycle(unittest.TestCase):
    def test_genuine_lifecycle(self):
        # We expect the image to be passed via an environment variable in CI
        import os
        image = os.environ.get("CLAMD_IMAGE")
        if not image:
            # Skip in normal local unit test runs, only run when explicitly provided
            self.skipTest("CLAMD_IMAGE environment variable not set")

        container_name = "test_clamd_lifecycle"

        # Establish healthy startup
        print("Starting container to establish healthy startup...")
        run_cmd(["docker", "rm", "-f", container_name])
        res = run_cmd(["docker", "run", "-d", "--name", container_name, "-e", "FRESHCLAM_INTERVAL_SECONDS=5", image])
        self.assertEqual(res.returncode, 0, f"Failed to start container: {res.stderr}")

        success = wait_for_log(container_name, "database is up-to-date", 30) or wait_for_log(container_name, "updated (version:", 30)
        if not success:
            run_cmd(["docker", "logs", container_name])
            run_cmd(["docker", "rm", "-f", container_name])
            self.fail("Failed to observe initial freshclam update or up-to-date status.")

        print("Healthy startup established. Injecting refresh failure AFTER startup...")
        run_cmd(["docker", "exec", container_name, "sh", "-c", "rm -f /etc/clamav/freshclam.conf"])

        success = wait_for_log(container_name, "freshclam refresh failed; marking not ready", 30)
        if not success:
            run_cmd(["docker", "logs", container_name])
            run_cmd(["docker", "rm", "-f", container_name])
            self.fail("Failed to observe freshclam refresh failure.")

        print("Failed refresh successfully marked not ready.")
        run_cmd(["docker", "rm", "-f", container_name])
        print("Genuine engine lifecycle harness completed successfully.")

if __name__ == "__main__":
    unittest.main()
