import unittest
import os
import subprocess
import time
import re
import socket
import struct

def run_cmd(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)

def wait_for_log(container, pattern, timeout, stream="stdout", since=None):
    cmd = ["docker", "logs"]
    if since:
        cmd.extend(["--since", since])
    cmd.append(container)

    start = time.time()
    while time.time() - start < timeout:
        res = run_cmd(cmd)
        logs = res.stdout if stream == "stdout" else res.stderr
        if stream == "both":
            logs += res.stdout
        if pattern in logs:
            return True
        time.sleep(2)
    return False

def zinstream_ping(host, port, payload, timeout=2):
    try:
        s = socket.create_connection((host, port), timeout=timeout)
        s.sendall(b'zINSTREAM\0')
        s.sendall(struct.pack('>I', len(payload)) + payload)
        s.sendall(struct.pack('>I', 0))
        reply = s.recv(4096)
        s.close()
        return reply.decode('utf-8', errors='ignore')
    except Exception as e:
        return str(e)

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
        print("Starting container to establish healthy startup...")
        start_time = run_cmd(["date", "-Iseconds"]).stdout.strip()
        # Publish port 3310 for real gateway/transport protocol checks
        res = run_cmd(["docker", "run", "-d", "--name", self.container_name, "-p", "3310:3310", "-e", "FRESHCLAM_INTERVAL_SECONDS=5", self.image])
        self.assertEqual(res.returncode, 0, f"Failed to start container: {res.stderr}")

        success = wait_for_log(self.container_name, "updated (version:", 60, "stdout")
        self.assertTrue(success, "Failed to observe initial freshclam update log")
        time.sleep(5)

        # 1. Verify marker and mtime_1
        res = run_cmd(["docker", "exec", self.container_name, "cat", "/var/run/clamav-ready/ready.version"])
        self.assertEqual(res.returncode, 0)
        marker_version = res.stdout.strip()
        self.assertTrue(marker_version.isdigit())

        res = run_cmd(["docker", "exec", self.container_name, "stat", "-c", "%Y", "/var/run/clamav-ready/ready"])
        self.assertEqual(res.returncode, 0)
        marker_mtime_1 = int(res.stdout.strip())
        self.assertGreater(marker_mtime_1, 0)

        # 2. Coexistence case: create a dummy daily.cvd and ensure daily.cld is still preferred
        run_cmd(["docker", "exec", self.container_name, "sh", "-c", "echo 'ClamAV-VDB:11 Jan 2024 12:00:00 -0000:1:42:60:12345:67890:a' > /var/lib/clamav/daily.cvd"])
        # Wait for next unchanged check
        success = wait_for_log(self.container_name, "database is up-to-date", 30, "stdout", since=start_time)
        self.assertTrue(success, "Failed to observe verified-unchanged renewal")

        # Verify marker version is still the real one from daily.cld, not daily.cvd's 1
        res = run_cmd(["docker", "exec", self.container_name, "cat", "/var/run/clamav-ready/ready.version"])
        self.assertEqual(res.stdout.strip(), marker_version)

        # 3. Controlled genuine daily-version change/reload
        # Downgrade daily.cld header version to 1 to force freshclam to update it
        print("Injecting downgrade for actual update...")
        run_cmd(["docker", "cp", f"{self.container_name}:/var/lib/clamav/daily.cld", "/tmp/daily.cld"])
        with open("/tmp/daily.cld", "r+b") as f:
            header = f.read(512)
            parts = header.split(b':')
            parts[2] = b'1'
            f.seek(0)
            f.write(b':'.join(parts))
        update_time = run_cmd(["date", "-Iseconds"]).stdout.strip()
        run_cmd(["docker", "cp", "/tmp/daily.cld", f"{self.container_name}:/var/lib/clamav/daily.cld"])

        success = wait_for_log(self.container_name, "updated (version:", 60, "stdout", since=update_time)
        self.assertTrue(success, "Failed to observe genuine update after downgrade")
        time.sleep(2)

        res = run_cmd(["docker", "exec", self.container_name, "stat", "-c", "%Y", "/var/run/clamav-ready/ready"])
        marker_mtime_2 = int(res.stdout.strip())
        self.assertGreaterEqual(marker_mtime_2, marker_mtime_1, "Marker mtime should advance or equal on update")

        # 4. Failed/pending reload -> activated-version scenario
        print("Injecting failed reload...")
        # Corrupt daily.cld with higher version
        with open("/tmp/daily_corrupt.cld", "wb") as f:
            f.write(b"ClamAV-VDB:11 Jan 2024 12:00:00 -0000:999999:42:60:12345:67890:a" + b"0"*1024)
        run_cmd(["docker", "cp", "/tmp/daily_corrupt.cld", f"{self.container_name}:/var/lib/clamav/daily.cld"])
        # Trigger reload
        run_cmd(["docker", "exec", self.container_name, "sh", "-c", "printf 'RELOAD\\0' | nc 127.0.0.1 3310"])
        time.sleep(2)
        # Verify clamd rejected it and loaded version is STILL the old marker_version
        res = run_cmd(["docker", "exec", self.container_name, "sh", "-c", "printf 'zVERSION\\0' | nc 127.0.0.1 3310"])
        loaded_reply = res.stdout.strip()
        match = re.search(r'ClamAV [^/]+/([^/]+)/', loaded_reply)
        self.assertEqual(match.group(1), marker_version, "Clamd should retain old version on failed reload")

        # Restore good daily.cld and reload
        run_cmd(["docker", "exec", self.container_name, "sh", "-c", "rm -f /var/lib/clamav/daily.cld"])
        run_cmd(["docker", "exec", self.container_name, "sh", "-c", "printf 'RELOAD\\0' | nc 127.0.0.1 3310"])
        time.sleep(2)

        # 5. Real gateway/transport INSTREAM failure
        print("Injecting transport fault via paused clamd...")
        res = run_cmd(["docker", "exec", self.container_name, "sh", "-c", "kill -STOP $(pgrep -x clamd)"])
        self.assertEqual(res.returncode, 0)

        # Send fully framed INSTREAM payload from host (simulating real gateway)
        reply = zinstream_ping("127.0.0.1", 3310, b"clean data", timeout=2)
        self.assertIn("timed out", reply.lower())

        # Resume clamd
        res = run_cmd(["docker", "exec", self.container_name, "sh", "-c", "kill -CONT $(pgrep -x clamd)"])
        self.assertEqual(res.returncode, 0)
        time.sleep(1)

        # 6. EICAR / CLEAN recovery
        reply = zinstream_ping("127.0.0.1", 3310, b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*")
        self.assertIn("FOUND", reply)
        reply = zinstream_ping("127.0.0.1", 3310, b"clean data")
        self.assertIn("OK", reply)

        print("Genuine engine lifecycle harness completed successfully.")

if __name__ == "__main__":
    unittest.main()
