import os
import sys
import tempfile
import subprocess
import time
import shutil
import unittest

def create_mock_freshclam(bin_dir, state_file, db_dir):
    mock = os.path.join(bin_dir, "freshclam")
    with open(mock, "w") as f:
        f.write(f'''#!/bin/sh
# Mock freshclam
state=$(cat "{state_file}")
echo "Mock freshclam running in state $state" >&2
if [ "$state" = "initial" ]; then
    printf 'ClamAV-VDB:11 Oct 2023 10-00-00:1:0:0:0:0:0:0:0' > "{db_dir}/daily.cld"
    echo "daily.cld updated (version: 1, sigs: 1, f-level: 1, builder: me)"
    exit 0
elif [ "$state" = "fail" ]; then
    echo "Connection failed"
    exit 1
elif [ "$state" = "unchanged" ]; then
    echo "daily.cld database is up-to-date (version: 1, sigs: 1, f-level: 1, builder: me)"
    exit 0
elif [ "$state" = "update" ]; then
    printf 'ClamAV-VDB:12 Oct 2023 10-00-00:2:0:0:0:0:0:0:0' > "{db_dir}/daily.cld"
    echo "daily.cld updated (version: 2, sigs: 2, f-level: 2, builder: me)"
    exit 0
fi
exit 0
''')
    os.chmod(mock, 0o755)

def create_mock_clamd(bin_dir):
    mock = os.path.join(bin_dir, "clamd")
    with open(mock, "w") as f:
        f.write('''#!/bin/sh
# Mock clamd
echo "Mock clamd starting" >&2
while true; do sleep 1; done
''')
    os.chmod(mock, 0o755)

def create_mock_clamdscan(bin_dir):
    mock = os.path.join(bin_dir, "clamdscan")
    with open(mock, "w") as f:
        f.write('''#!/bin/sh
# Mock clamdscan
exit 0
''')
    os.chmod(mock, 0o755)

class TestClamdLifecycle(unittest.TestCase):
    def test_lifecycle(self):
        print("Running bounded hosted harness lifecycle test...")
        with tempfile.TemporaryDirectory() as td:
            bin_dir = os.path.join(td, "bin")
            os.makedirs(bin_dir)
            db_dir = os.path.join(td, "db")
            os.makedirs(db_dir)
            state_file = os.path.join(td, "state")
            ready_dir = os.path.join(td, "ready")
            os.makedirs(ready_dir)

            with open(state_file, "w") as f:
                f.write("initial")

            create_mock_freshclam(bin_dir, state_file, db_dir)
            create_mock_clamd(bin_dir)
            create_mock_clamdscan(bin_dir)

            env = os.environ.copy()
            env["PATH"] = f"{bin_dir}:{env['PATH']}"
            env["CLAMAV_DB_DIR"] = db_dir
            env["CLAMAV_READY_MARKER"] = os.path.join(ready_dir, "ready")
            env["CLAMAV_READY_VERSION_FILE"] = os.path.join(ready_dir, "ready.version")
            env["FRESHCLAM_INTERVAL_SECONDS"] = "1"

            script_path = os.path.abspath("operations/artifact-scanner/clamd-entrypoint.sh")

            proc = subprocess.Popen(["sh", script_path], env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

            try:
                # Wait for initial readiness
                for _ in range(10):
                    if os.path.exists(env["CLAMAV_READY_MARKER"]):
                        break
                    time.sleep(0.5)
                self.assertTrue(os.path.exists(env["CLAMAV_READY_MARKER"]), "Failed to establish healthy engine")
                with open(env["CLAMAV_READY_VERSION_FILE"]) as f:
                    ver = f.read().strip()
                self.assertEqual(ver, "1", f"Expected version 1, got {ver}")

                # Inject failure AFTER startup
                with open(state_file, "w") as f:
                    f.write("fail")

                # Wait for marker to be removed (reload failure)
                for _ in range(10):
                    if not os.path.exists(env["CLAMAV_READY_MARKER"]):
                        break
                    time.sleep(0.5)
                self.assertFalse(os.path.exists(env["CLAMAV_READY_MARKER"]), "Expected marker to be removed after failure")

                # Verify distinct unchanged renewal
                with open(state_file, "w") as f:
                    f.write("unchanged")

                for _ in range(10):
                    if os.path.exists(env["CLAMAV_READY_MARKER"]):
                        break
                    time.sleep(0.5)
                self.assertTrue(os.path.exists(env["CLAMAV_READY_MARKER"]), "Expected marker to be renewed after unchanged")

                # Verify actual update
                with open(state_file, "w") as f:
                    f.write("update")

                for _ in range(10):
                    if os.path.exists(env["CLAMAV_READY_VERSION_FILE"]):
                        with open(env["CLAMAV_READY_VERSION_FILE"]) as f:
                            if f.read().strip() == "2":
                                break
                    time.sleep(0.5)

                with open(env["CLAMAV_READY_VERSION_FILE"]) as f:
                    ver = f.read().strip()
                self.assertEqual(ver, "2", f"Expected version 2, got {ver}")

                print("Bounded lifecycle test passed!")

            finally:
                proc.terminate()
                proc.wait()

if __name__ == "__main__":
    unittest.main()
