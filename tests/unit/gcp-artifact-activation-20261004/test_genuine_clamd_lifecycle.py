import struct
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

def instream_payload(data: bytes) -> bytes:
    """Byte-for-byte the same framing as
    operations/artifact-scanner/gateway/clamd-protocol.ts#encodeInstream:
    a literal 'zINSTREAM\\0' command, length-prefixed 64 KiB chunks, and a
    zero-length terminator chunk. A bare 'zINSTREAM\\0' with no chunk at all
    (the prior version of this harness) never reaches clamd's scan logic --
    it just stalls clamd waiting for framed content -- so it could not
    distinguish "transport is actually broken" from "we never sent a real
    request"."""
    chunk_size = 64 * 1024
    out = bytearray(b"zINSTREAM\0")
    for offset in range(0, len(data), chunk_size):
        chunk = data[offset:offset + chunk_size]
        out += struct.pack(">I", len(chunk))
        out += chunk
    out += struct.pack(">I", 0)
    return bytes(out)

def clamd_instream(container_name, data: bytes, timeout_s=10, idle_s=5):
    """Sends a real, correctly framed INSTREAM request over the container's
    live clamd TCP port from the host side (the clamd/busybox image ships no
    python3, so the payload is built here and piped through `docker exec -i
    ... nc`), and returns the raw decoded reply clamd itself produced -- the
    same text operations/artifact-scanner/gateway/clamd-protocol.ts#parseInstreamReply
    parses ("stream: OK" / "stream: <sig> FOUND"), not nc's own exit code."""
    payload = instream_payload(data)
    res = subprocess.run(
        ["docker", "exec", "-i", container_name, "nc", "-w", str(idle_s), "127.0.0.1", "3310"],
        input=payload,
        capture_output=True,
        timeout=timeout_s,
    )
    return res.stdout.decode("utf-8", errors="replace").strip("\x00\r\n ")

# Mirrors clamd-entrypoint.sh#cvd_version exactly: the ClamAV-VDB header's
# own 3rd colon-delimited field, read from the first 512 bytes of the
# on-disk file. Re-implemented independently here (rather than trusting the
# entrypoint's own readiness-marker output) so this harness can cross-check
# the entrypoint's publication against the real file ClamAV itself loaded.
def cvd_version(container_name, path):
    res = run_cmd(["docker", "exec", container_name, "sh", "-c", f"head -c 512 {path} 2>/dev/null | cat -v"])
    if res.returncode != 0:
        return None
    header = res.stdout
    if not header.startswith("ClamAV-VDB:"):
        return None
    fields = header.split(":")
    if len(fields) < 3 or not fields[2].isdigit():
        return None
    return fields[2]

def file_exists(container_name, path):
    return run_cmd(["docker", "exec", container_name, "test", "-f", path]).returncode == 0

def stat_mtime(container_name, path):
    res = run_cmd(["docker", "exec", container_name, "stat", "-c", "%Y", path])
    if res.returncode != 0:
        return None
    return res.stdout.strip()

# Mirrors clamd-entrypoint.sh#daily_reference_file's tie-break: equal
# versions -> .cld (incremental patch) wins; otherwise the strictly
# higher-version file wins regardless of extension.
def expected_reference_file(cvd_ver, cld_ver):
    if cvd_ver is not None and cld_ver is not None:
        return "daily.cvd" if int(cvd_ver) > int(cld_ver) else "daily.cld"
    if cld_ver is not None:
        return "daily.cld"
    if cvd_ver is not None:
        return "daily.cvd"
    return None

class TestGenuineClamdLifecycle(unittest.TestCase):
    def setUp(self):
        self.image = os.environ.get("CLAMD_IMAGE")
        self.container_name = "test_clamd_lifecycle"
        self.db_dir = "/var/lib/clamav"
        if not self.image:
            self.skipTest("CLAMD_IMAGE environment variable not set")
        run_cmd(["docker", "rm", "-f", self.container_name])

    def tearDown(self):
        run_cmd(["docker", "rm", "-f", self.container_name])

    def _reference_file_state(self):
        cvd_path = f"{self.db_dir}/daily.cvd"
        cld_path = f"{self.db_dir}/daily.cld"
        cvd_ver = cvd_version(self.container_name, cvd_path) if file_exists(self.container_name, cvd_path) else None
        cld_ver = cvd_version(self.container_name, cld_path) if file_exists(self.container_name, cld_path) else None
        return cvd_ver, cld_ver

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

        # Cross-check against the real on-disk daily.cvd/.cld header(s), using
        # the SAME selection rule clamd-entrypoint.sh#daily_reference_file
        # applies, instead of trusting the marker file's own claim in isolation.
        cvd_ver, cld_ver = self._reference_file_state()
        self.assertTrue(cvd_ver is not None or cld_ver is not None,
                         "Neither daily.cvd nor daily.cld carries a readable ClamAV-VDB header")
        expected_ref = expected_reference_file(cvd_ver, cld_ver)
        expected_ref_version = cvd_ver if expected_ref == "daily.cvd" else cld_ver
        self.assertEqual(marker_version, expected_ref_version,
                          f"Readiness marker version {marker_version} does not match the "
                          f"selected reference file {expected_ref}'s own header version {expected_ref_version}")
        daily_file_mtime_1 = stat_mtime(self.container_name, f"{self.db_dir}/{expected_ref}")
        self.assertIsNotNone(daily_file_mtime_1, f"Could not stat selected reference file {expected_ref}")

        # Record the marker mtime
        res = run_cmd(["docker", "exec", self.container_name, "stat", "-c", "%Y", "/var/run/clamav-ready/ready"])
        self.assertEqual(res.returncode, 0)
        marker_mtime_1 = res.stdout.strip()

        # Verify loaded version matches marker via a real, null-terminated zVERSION query
        res = run_cmd(["docker", "exec", self.container_name, "sh", "-c", "printf 'zVERSION\\0' | nc 127.0.0.1 3310"])
        self.assertEqual(res.returncode, 0, f"Failed to ping clamd: {res.stderr}")
        loaded_reply = res.stdout.strip()
        match = re.search(r'ClamAV [^/]+/([^/]+)/', loaded_reply)
        self.assertIsNotNone(match, "Could not parse version from ClamAV reply")
        loaded = match.group(1)
        self.assertEqual(loaded, marker_version, f"Loaded version {loaded} does not precisely match marker {marker_version}")

        # Verify unchanged renewal: trigger a second freshclam pass
        # deterministically (rather than passively waiting on the interval
        # watchdog) and bind the assertion to the exact selected
        # file/version, mirroring clamd-entrypoint.sh#daily_check_verified's
        # own binding rather than accepting ANY "database is up-to-date"
        # line in the surrounding log stream.
        print("Triggering deterministic unchanged freshclam pass...")
        unchanged_time = run_cmd(["date", "-Iseconds"]).stdout.strip()
        res = run_cmd(["docker", "exec", self.container_name, "freshclam", "--stdout"], timeout=30)
        self.assertEqual(res.returncode, 0, f"Manual freshclam pass failed: {res.stdout}{res.stderr}")
        expected_pattern = re.compile(
            re.escape(expected_ref) + r" database is up-to-date \(version: " + re.escape(expected_ref_version) + r"[,)]"
        )
        self.assertTrue(
            expected_pattern.search(res.stdout) is not None,
            f"Manual freshclam pass did not confirm '{expected_ref}' version {expected_ref_version} as up-to-date: {res.stdout}",
        )
        # The manual freshclam call above runs as a one-off `docker exec` and
        # its own stdout is never consumed by the entrypoint -- the real
        # republish comes from the watchdog's OWN, independent periodic
        # `freshclam --stdout` invocation (clamd-entrypoint.sh's background
        # loop, interval FRESHCLAM_INTERVAL_SECONDS=5 set at container
        # start). Sleeping past that interval lets the watchdog's own pass
        # observe the same still-unchanged on-disk database and republish
        # the marker; this does not depend on the manual call's output.
        time.sleep(7)
        daily_file_mtime_after_unchanged = stat_mtime(self.container_name, f"{self.db_dir}/{expected_ref}")
        self.assertEqual(daily_file_mtime_after_unchanged, daily_file_mtime_1,
                          "An 'up-to-date' freshclam pass must never rewrite the on-disk database file")
        res = run_cmd(["docker", "exec", self.container_name, "stat", "-c", "%Y", "/var/run/clamav-ready/ready"])
        self.assertEqual(res.returncode, 0)
        marker_mtime_after_unchanged = res.stdout.strip()
        self.assertGreater(
            int(marker_mtime_after_unchanged), int(marker_mtime_1),
            "A confirmed-but-unchanged freshclam pass must still renew the readiness marker's "
            "mtime to now (clamd-entrypoint.sh#publish_marker_from_signatures verified branch), "
            "or MAX_SIGNATURE_AGE_MS would eventually age out a genuinely current engine",
        )

        # Test scan of EICAR and CLEAN using clamdscan (real protocol)
        eicar = r"X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
        res = run_cmd(["docker", "exec", self.container_name, "sh", "-c", f"echo '{eicar}' > /tmp/eicar.com && clamdscan /tmp/eicar.com"])
        self.assertNotEqual(res.returncode, 0, "clamdscan should return non-zero for EICAR")
        self.assertIn("FOUND", res.stdout)

        res = run_cmd(["docker", "exec", self.container_name, "sh", "-c", "echo 'clean data' > /tmp/clean.txt && clamdscan /tmp/clean.txt"])
        self.assertEqual(res.returncode, 0, "clamdscan should return zero for clean file")
        self.assertIn("OK", res.stdout)

        # Verify the real gateway-facing INSTREAM protocol (length-prefixed
        # chunks + zero terminator, exactly as clamd-protocol.ts#encodeInstream
        # builds it) directly, not just via the clamdscan CLI helper.
        clean_reply = clamd_instream(self.container_name, b"clean data")
        self.assertEqual(clean_reply, "stream: OK", f"Unexpected INSTREAM reply for clean content: {clean_reply!r}")
        eicar_reply = clamd_instream(self.container_name, eicar.encode())
        self.assertRegex(eicar_reply, r"^stream: .+ FOUND$", f"Unexpected INSTREAM reply for EICAR: {eicar_reply!r}")

        # Inject transport fault: Pause actual clamd process
        print("Injecting external transport fault by pausing clamd...")
        res = run_cmd(["docker", "exec", self.container_name, "sh", "-c", "kill -STOP $(pgrep -x clamd)"])
        self.assertEqual(res.returncode, 0, f"Failed to stop clamd: {res.stderr}")

        # Attempt a REAL, fully framed INSTREAM request while clamd is
        # paused. The kernel still accepts the TCP connection and buffers
        # the bytes, but a stopped clamd process is never scheduled to read
        # or reply, so the only genuine signal of a broken transport is the
        # absence of any "stream:" verdict within the bounded idle window --
        # not nc's own exit code, which varies across nc implementations and
        # says nothing about whether a real scan verdict was ever produced.
        stalled_reply = clamd_instream(self.container_name, b"clean data", timeout_s=8, idle_s=3)
        self.assertNotIn("stream:", stalled_reply,
                          f"Expected no scan verdict while clamd is paused, got: {stalled_reply!r}")

        # Resume clamd
        res = run_cmd(["docker", "exec", self.container_name, "sh", "-c", "kill -CONT $(pgrep -x clamd)"])
        self.assertEqual(res.returncode, 0, f"Failed to resume clamd: {res.stderr}")

        # Verify it works again
        res = run_cmd(["docker", "exec", self.container_name, "sh", "-c", "printf 'zPING\\0' | nc 127.0.0.1 3310"])
        self.assertEqual(res.returncode, 0, "Failed to ping clamd after resume")
        self.assertIn("PONG", res.stdout)
        resumed_reply = clamd_instream(self.container_name, b"clean data")
        self.assertEqual(resumed_reply, "stream: OK", f"Unexpected INSTREAM reply after resume: {resumed_reply!r}")

        print("Injecting refresh failure AFTER startup...")
        fault_time = run_cmd(["date", "-Iseconds"]).stdout.strip()
        # Break freshclam by removing conf
        res = run_cmd(["docker", "exec", self.container_name, "sh", "-c", "rm -f /etc/clamav/freshclam.conf"])
        self.assertEqual(res.returncode, 0, f"Failed to inject fault: {res.stderr}")

        success = wait_for_log(self.container_name, "freshclam refresh failed; marking not ready", 30, "stderr", since=fault_time)
        if not success:
            self.fail("Failed to observe freshclam refresh failure")

        # After failure, clamd-entrypoint.sh#refresh_daily_readiness removes
        # BOTH the marker and its sibling version file in the same call --
        # a pending/failed reload must leave neither artifact behind.
        res = run_cmd(["docker", "exec", self.container_name, "cat", "/var/run/clamav-ready/ready"])
        self.assertNotEqual(res.returncode, 0, "Readiness marker should be deleted after failure")
        res = run_cmd(["docker", "exec", self.container_name, "cat", "/var/run/clamav-ready/ready.version"])
        self.assertNotEqual(res.returncode, 0, "Readiness version file should be deleted after failure")

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

        # Cross-check the recovered marker against the real on-disk file
        # again, the same way the initial-startup check did, so a pending
        # reload that merely wrote a marker without clamd truly reloading
        # cannot pass as "activated".
        cvd_ver_2, cld_ver_2 = self._reference_file_state()
        expected_ref_2 = expected_reference_file(cvd_ver_2, cld_ver_2)
        expected_ref_version_2 = cvd_ver_2 if expected_ref_2 == "daily.cvd" else cld_ver_2
        self.assertEqual(recovered_version, expected_ref_version_2,
                          f"Recovered marker version {recovered_version} does not match on-disk "
                          f"{expected_ref_2}'s header version {expected_ref_version_2}")

        # Verify marker mtime has advanced past the LATEST known-good
        # pre-failure value. `marker_mtime_1` is from the initial startup,
        # long before the later refresh-failure injection; comparing
        # against it would let a recovery that merely restored that old,
        # untouched marker pass. `marker_mtime_after_unchanged` is the
        # marker's mtime immediately before the fault was injected, so this
        # is the correct baseline to prove recovery actually republished.
        res = run_cmd(["docker", "exec", self.container_name, "stat", "-c", "%Y", "/var/run/clamav-ready/ready"])
        self.assertEqual(res.returncode, 0)
        marker_mtime_2 = res.stdout.strip()
        self.assertGreater(int(marker_mtime_2), int(marker_mtime_after_unchanged),
                            "Readiness marker mtime must advance past its latest pre-failure value once "
                            "recovery is confirmed, proving the failed/pending window actually ended in a "
                            "fresh republish rather than a marker that merely survived untouched")

        # Verify equality
        res = run_cmd(["docker", "exec", self.container_name, "sh", "-c", "printf 'zVERSION\\0' | nc 127.0.0.1 3310"])
        loaded_reply_2 = res.stdout.strip()
        match = re.search(r'ClamAV [^/]+/([^/]+)/', loaded_reply_2)
        loaded_2 = match.group(1)
        self.assertEqual(loaded_2, recovered_version, f"Recovered loaded version {loaded_2} does not match marker {recovered_version}")

        # Verify clean/EICAR after recovery, via both clamdscan and the raw
        # gateway-facing INSTREAM protocol.
        res = run_cmd(["docker", "exec", self.container_name, "sh", "-c", "clamdscan /tmp/clean.txt"])
        self.assertEqual(res.returncode, 0, f"clamdscan failed for clean file after recovery: {res.stdout}")
        self.assertIn("OK", res.stdout)

        res = run_cmd(["docker", "exec", self.container_name, "sh", "-c", "clamdscan /tmp/eicar.com"])
        self.assertNotEqual(res.returncode, 0, "clamdscan should fail for EICAR after recovery")
        self.assertIn("FOUND", res.stdout)

        final_clean_reply = clamd_instream(self.container_name, b"clean data")
        self.assertEqual(final_clean_reply, "stream: OK", f"Unexpected INSTREAM reply for clean after recovery: {final_clean_reply!r}")
        final_eicar_reply = clamd_instream(self.container_name, eicar.encode())
        self.assertRegex(final_eicar_reply, r"^stream: .+ FOUND$", f"Unexpected INSTREAM reply for EICAR after recovery: {final_eicar_reply!r}")

        print("Genuine engine lifecycle harness completed successfully.")
        print(
            "NOTE: a controlled bump to a NEWER daily signature version is not fabricated here. "
            "clamd-entrypoint.sh#cvd_version only trusts a file whose ClamAV-VDB header parses; "
            "manufacturing a higher-version daily.cvd/.cld without either a genuine upstream "
            "release during this run or ClamAV's private signing material would not be a real "
            "engine behavior and is out of this harness's write scope (gateway/runtime sources "
            "are not in this task's write_scopes). This run instead cross-validates the real "
            "on-disk header/version/mtime and coexistence-selection rule against whatever "
            "daily.cvd/.cld the live upstream mirror actually served."
        )

if __name__ == "__main__":
    unittest.main()
