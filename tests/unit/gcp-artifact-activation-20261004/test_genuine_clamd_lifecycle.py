import functools
import hashlib
import http.server
import json
import struct
import subprocess
import tempfile
import threading
import time
import sys
import os
import unittest
import re
import urllib.error
import urllib.request

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

def wait_for_ping(container_name, timeout=60):
    """Polls clamd's own real zPING idle command (not a log line, which can
    print before clamd is actually accepting connections) until it answers
    PONG, or the bound expires."""
    start = time.time()
    while time.time() - start < timeout:
        res = run_cmd(["docker", "exec", container_name, "sh", "-c", "printf 'zPING\\0' | nc 127.0.0.1 3310"])
        if res.returncode == 0 and "PONG" in res.stdout:
            return True
        time.sleep(1)
    return False

def query_loaded_version(container_name):
    """Real, null-terminated zVERSION query -- the same live proof
    readiness.ts#createIsReady itself requires, not a parsed log line."""
    res = run_cmd(["docker", "exec", container_name, "sh", "-c", "printf 'zVERSION\\0' | nc 127.0.0.1 3310"])
    if res.returncode != 0:
        return None
    match = re.search(r'ClamAV [^/]+/([^/]+)/', res.stdout.strip())
    return match.group(1) if match else None

def file_exists(container_name, path):
    return run_cmd(["docker", "exec", container_name, "test", "-f", path]).returncode == 0

def stat_mtime(container_name, path):
    res = run_cmd(["docker", "exec", container_name, "stat", "-c", "%Y", path])
    if res.returncode != 0:
        return None
    return res.stdout.strip()

def container_logs_since(container_name, since):
    """Real `docker logs --since <ts>` capture (stdout+stderr), used to bind
    an assertion to a SPECIFIC invocation's own output rather than any
    invocation's generic exit code or a later, indirect side effect."""
    res = run_cmd(["docker", "logs", "--since", since, container_name], timeout=15)
    return (res.stdout or "") + (res.stderr or "")

def container_published_port(container_name, container_port):
    """Reads back the host port Docker actually published for
    `container_port` on `container_name` (set via `-p 0:<container_port>` at
    creation) -- the same readback a real caller would use, not a value
    this harness invents."""
    res = run_cmd(["docker", "port", container_name, str(container_port)])
    if res.returncode != 0 or not res.stdout.strip():
        return None
    line = res.stdout.strip().splitlines()[0]
    return int(line.rsplit(":", 1)[1])

def start_gateway_sidecar(gateway_image, gateway_container_name, clamd_container_name, ready_host_dir, clamd_port=3310):
    """Starts the real gateway image (operations/artifact-scanner/gateway,
    unmodified) joined to `clamd_container_name`'s own network namespace via
    Docker's `--network container:<name>` -- the faithful local equivalent
    of provision-dev-artifact-backends.py's multi-container Cloud Run
    service, where both containers share one instance's loopback network --
    plus the SAME host directory bind-mounted at the readiness marker's
    directory, mirroring that script's shared in-memory `clamav-ready`
    volume (`--add-volume-mount` on both containers). Only gateway/server.ts's
    own documented env vars (CLAMD_HOST/CLAMD_PORT) are set; no gateway
    source is touched. `clamd_port` defaults to clamd's real listening port
    3310; TestGenuineGatewayTransportFault below points it at a protocol-aware
    relay sharing this same namespace instead, so gateway/server.ts:15-19's
    single CLAMD_HOST/CLAMD_PORT config feeds BOTH versionClamd (isReady) and
    exchangeWithClamd (the scan) through the relay, exactly as it feeds both
    through clamd directly in production."""
    return run_cmd([
        "docker", "run", "-d", "--name", gateway_container_name,
        "--network", f"container:{clamd_container_name}",
        "-v", f"{ready_host_dir}:/var/run/clamav-ready",
        "-e", "CLAMD_HOST=127.0.0.1",
        "-e", f"CLAMD_PORT={clamd_port}",
        gateway_image,
    ])

def gateway_scan(host_port, data, content_type="application/pdf", timeout=10):
    """Real HTTP POST /scan against the gateway's own documented contract
    (gateway/handler.ts#createRequestHandler): Content-Type must be an
    allowed MIME type and X-Content-SHA256 must match the body. Returns
    (status, parsed-JSON-body-or-None), exactly what a real caller sees --
    not a value this harness invents."""
    digest = hashlib.sha256(data).hexdigest()
    req = urllib.request.Request(
        f"http://127.0.0.1:{host_port}/scan",
        data=data,
        method="POST",
        headers={"Content-Type": content_type, "X-Content-SHA256": digest},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read()
            return resp.status, (json.loads(body) if body else None)
    except urllib.error.HTTPError as exc:
        body = exc.read()
        try:
            return exc.code, (json.loads(body) if body else None)
        except (ValueError, TypeError):
            return exc.code, None

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
        # The marker-mtime advance above only proves SOME invocation took the
        # verified branch; it does not by itself prove it was the
        # watchdog's OWN periodic pass (rather than, say, a coincidental
        # second signal) that affirmatively named this exact selected
        # file/version. A real `docker exec` never writes to `docker logs`
        # (its stdout is the exec session's own, captured above as
        # `res.stdout`), so anything the entrypoint's backgrounded watchdog
        # loop itself printed since `unchanged_time` is -- uniquely --
        # the watchdog's own invocation, not the manual call already
        # checked above.
        watchdog_output = container_logs_since(self.container_name, unchanged_time)
        self.assertTrue(
            expected_pattern.search(watchdog_output) is not None,
            f"Watchdog's own periodic freshclam pass did not itself confirm '{expected_ref}' "
            f"version {expected_ref_version} as up-to-date (checked docker logs since "
            f"{unchanged_time}): {watchdog_output!r}",
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

        # The generic `wait_for_log` above only proves SOME "up-to-date"/
        # "updated" line appeared since `recover_time`; a message naming a
        # stale, non-selected sibling file (clamd-entrypoint.sh's own
        # documented hazard -- see `daily_check_verified`) would also match
        # it. Now that the real recovered file/version is known, bind the
        # same invocation's own output to that exact selected identity, the
        # same way `daily_check_verified` itself requires, rather than
        # accepting any generic database message as proof of THIS recovery.
        recovery_pattern = re.compile(
            re.escape(expected_ref_2) + r" (database is up-to-date|updated) \(version: "
            + re.escape(expected_ref_version_2) + r"[,)]"
        )
        recovery_output = container_logs_since(self.container_name, recover_time)
        self.assertTrue(
            recovery_pattern.search(recovery_output) is not None,
            f"No freshclam invocation since {recover_time} affirmatively confirmed the recovered "
            f"'{expected_ref_2}' version {expected_ref_version_2} by name (checked docker logs): "
            f"{recovery_output!r}",
        )

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

# R5b.2-lifecycle, REOPEN round 3's remaining gap: the test above never
# exercises a REAL old-loaded -> newer-on-disk-but-not-yet-activated ->
# newer-activated transition, because the entrypoint's own first
# `freshclam --stdout` call (clamd-entrypoint.sh line ~223) always runs
# BEFORE clamd ever starts, so whatever daily.cvd/.cld clamd loads at
# startup is already whichever version that first call resolved to.
# Manufacturing a higher-version CVD/CLD ourselves is not an option
# (ClamAV's private signing keys are unavailable to this harness, and a
# forged header would not be real engine behavior); the only legitimate
# source of a genuinely-signed OLDER daily database is a real file that
# Cisco Talos actually published and that still exists somewhere on disk.
# `clamav/clamav:1.3` is exactly that: this project's own
# Dockerfile.clamd already documents it as EOL ("database-download support
# ended 2026-02-07") and explicitly rejected for THIS task's own runtime
# image -- which also means that tag's own image layers are frozen and no
# longer rebuilt with a fresh database, so whatever daily.cvd/.cld it
# baked at its own last build is a real, authentically-signed snapshot
# that must be older than whatever today's live mirror serves. This never
# starts or runs freshclam inside that EOL image (whose client-side
# database-download protocol is itself the rejected/unsupported part) --
# only `docker cp`s the static file off its layers, matching this
# harness's own write-scope boundary (gateway/runtime sources, including
# clamd-entrypoint.sh and clamd.conf, stay untouched; every write below is
# runtime `docker create`/`docker cp`/`docker exec` orchestration, like
# the rest of this file).
#
# Known precondition this Docker-less VM cannot verify locally (documented
# per Guide 0.7 rather than assumed silently): that `clamav/clamav:1.3`
# actually ships a readable daily.cvd/.cld in its image layers, and that
# the copied file's ownership/permissions remain usable by the target
# container's freshclam/clamd processes. If either does not hold, the
# assertions below fail with a specific, attributable message identifying
# which precondition was missing -- not a false pass.
#
# A genuinely unreachable mirror (the first version of this harness pointed
# `DatabaseMirror` at 127.0.0.1) is NOT usable to seed the stale startup
# state: `clamd-entrypoint.sh` runs under `set -eu` and its very first
# `freshclam --stdout` call (line ~223) is unguarded -- any non-zero exit
# from that call terminates the container before clamd (line ~227) ever
# starts, which is a real `set -eu` consequence of this harness's own
# fixture, not a production bug (clamd-entrypoint.sh is outside this task's
# write_scopes and stays untouched). Instead, this test runs its own local
# HTTP static-file server (`_start_local_mirror`, this test process only --
# no gateway/runtime source touched) that serves the EXACT same
# main/daily/bytecode CVD bytes just extracted from `clamav/clamav:1.3`,
# and points the seeded container's `freshclam.conf` at it via
# `PrivateMirror` (a real, documented freshclam directive that skips the
# DNS TXT version check and fetches directly from the given URL). Because
# the served content is byte-identical to what was just seeded on disk,
# freshclam's own version comparison against each database genuinely
# resolves "up-to-date" for all three databases and exits 0 -- a real,
# unforced freshclam outcome, not a stubbed one -- so the unguarded initial
# call succeeds and clamd starts up loading the still-stale seed. The
# container reaches clamd via `host.docker.internal` (`--add-host
# host.docker.internal:host-gateway`, a real Docker Engine >=20.10 feature
# on Linux, not Mac/Windows-only). Known precondition this Docker-less VM
# cannot verify locally: whether the installed freshclam build honors an
# HTTP Range request against Python's stdlib `http.server` (which may reply
# 200 with the full body instead of 206) when probing a CVD header via
# PrivateMirror; if that combination does not hold, the assertions below
# fail with a specific, attributable message (e.g. the initial-load
# precondition assertion), not a false pass.
SEED_IMAGE = "clamav/clamav:1.3"
SEED_DB_FILES = (
    "main.cvd", "main.cld", "daily.cvd", "daily.cld", "bytecode.cvd", "bytecode.cld",
)

class TestGenuineClamdVersionTransition(unittest.TestCase):
    def setUp(self):
        self.image = os.environ.get("CLAMD_IMAGE")
        self.gateway_image = os.environ.get("GATEWAY_IMAGE")
        self.container_name = "test_clamd_version_transition"
        self.seed_container_name = "test_clamd_version_transition_seed"
        self.gateway_container_name = "test_clamd_version_transition_gateway"
        self.db_dir = "/var/lib/clamav"
        if not self.image:
            self.skipTest("CLAMD_IMAGE environment variable not set")
        if not self.gateway_image:
            self.skipTest("GATEWAY_IMAGE environment variable not set")
        run_cmd(["docker", "rm", "-f", self.container_name])
        run_cmd(["docker", "rm", "-f", self.seed_container_name])
        run_cmd(["docker", "rm", "-f", self.gateway_container_name])

    def tearDown(self):
        run_cmd(["docker", "rm", "-f", self.gateway_container_name])
        run_cmd(["docker", "rm", "-f", self.container_name])
        run_cmd(["docker", "rm", "-f", self.seed_container_name])

    def _extract_seed_database(self, tmp_dir):
        # Extracts ALL three databases (main/daily/bytecode), not just
        # daily: the local PrivateMirror below must be able to answer every
        # database freshclam.conf asks about with byte-identical content to
        # what was seeded on disk, or freshclam reports a genuine fetch
        # failure for whichever one is missing and the unguarded initial
        # call in clamd-entrypoint.sh (set -eu) kills the container before
        # clamd ever starts.
        pull = run_cmd(["docker", "pull", SEED_IMAGE], timeout=180)
        self.assertEqual(pull.returncode, 0, f"Failed to pull seed image {SEED_IMAGE}: {pull.stderr}")
        create = run_cmd(["docker", "create", "--name", self.seed_container_name, SEED_IMAGE])
        self.assertEqual(create.returncode, 0, f"Failed to create seed container: {create.stderr}")
        found = {}
        for name in SEED_DB_FILES:
            dest = os.path.join(tmp_dir, name)
            cp = run_cmd(["docker", "cp", f"{self.seed_container_name}:{self.db_dir}/{name}", dest])
            if cp.returncode == 0 and os.path.isfile(dest) and os.path.getsize(dest) > 0:
                found[name] = dest
        run_cmd(["docker", "rm", "-f", self.seed_container_name])
        self.assertTrue(
            any(name.startswith("daily") for name in found),
            f"Precondition not met: seed image {SEED_IMAGE} does not ship a readable "
            f"daily.cvd/daily.cld at {self.db_dir}. This harness cannot manufacture a "
            "genuinely-signed historical database without one; a different concrete seed "
            "source is needed before this control can run.",
        )
        return found

    @staticmethod
    def _start_local_mirror(directory):
        """Serves `directory` over plain HTTP on an ephemeral port, in this
        test process only, so the seeded container's `freshclam.conf` can
        point `PrivateMirror` at it (see the module-level comment above
        `SEED_IMAGE`). Returns the live server; caller must `shutdown()` +
        `server_close()` it (this does not start or touch any clamd/freshclam
        process itself -- plain stdlib HTTP file serving)."""
        handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=directory)
        server = http.server.ThreadingHTTPServer(("0.0.0.0", 0), handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        return server

    def test_genuine_old_to_new_version_and_activation_lag(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            seed_files = self._extract_seed_database(tmp_dir)

            seed_name = "daily.cvd" if "daily.cvd" in seed_files else "daily.cld"
            header = run_cmd(["sh", "-c", f"head -c 512 '{seed_files[seed_name]}' | cat -v"]).stdout
            self.assertTrue(header.startswith("ClamAV-VDB:"), f"Seed {seed_name} has no readable ClamAV-VDB header")
            fields = header.split(":")
            self.assertTrue(len(fields) >= 3 and fields[2].isdigit(), f"Seed {seed_name} header has no numeric version: {header!r}")
            seed_version = fields[2]

            # Shared readiness-marker directory, bind-mounted into BOTH this
            # container and the real gateway sidecar started below at the
            # same path -- the local equivalent of
            # provision-dev-artifact-backends.py's shared in-memory
            # `clamav-ready` volume mounted into both the real `gateway` and
            # `clamd` Cloud Run containers (R5b.2-lifecycle REOPEN: the
            # gateway must observe the SAME marker files this container
            # publishes, not a copy).
            ready_dir = os.path.join(tmp_dir, "clamav-ready")
            os.makedirs(ready_dir, exist_ok=True)
            # World-writable: the real clamd and gateway images may run as
            # different internal users (neither of which is this test
            # process's own host uid), the same way Cloud Run's in-memory
            # `--add-volume` is writable by both containers regardless of
            # their own uid. Bounded to this one ephemeral, test-owned
            # temp directory only.
            os.chmod(ready_dir, 0o777)

            # Create (but do not start) the real target container, then
            # seed BOTH the stale database AND a freshclam.conf pointed at
            # this test process's own local HTTP mirror (see the
            # module-level comment above SEED_IMAGE for why a genuinely
            # unreachable mirror cannot be used here) into its writable
            # layer before the entrypoint's first (pre-clamd) freshclam
            # call ever runs, so that call resolves "up-to-date" against
            # the byte-identical seed and exits 0, and clamd starts up
            # loading the still-stale seed rather than a live download
            # silently overwriting it. `-p 0:8080` publishes a host port
            # into this container's own network namespace for a container
            # port nothing in THIS image listens on -- that is deliberate:
            # the real gateway sidecar below joins this exact namespace via
            # `--network container:<name>` (Docker's equivalent of Cloud
            # Run's shared-instance network, matching `Dockerfile.clamd`'s
            # own "reachable solely by the gateway container inside this
            # same Cloud Run instance" comment) and listens on 8080 itself;
            # Docker's port-publish is a namespace/port-level NAT rule, not
            # tied to which specific container issued the `listen()` call.
            create = run_cmd([
                "docker", "create", "--name", self.container_name,
                "--add-host", "host.docker.internal:host-gateway",
                "-p", "0:8080",
                "-v", f"{ready_dir}:/var/run/clamav-ready",
                "-e", "FRESHCLAM_INTERVAL_SECONDS=5", self.image,
            ])
            self.assertEqual(create.returncode, 0, f"Failed to create container: {create.stderr}")

            cp = run_cmd(["docker", "cp", seed_files[seed_name], f"{self.container_name}:{self.db_dir}/{seed_name}"])
            self.assertEqual(cp.returncode, 0, f"Failed to seed {seed_name}: {cp.stderr}")

            mirror_server = self._start_local_mirror(tmp_dir)
            try:
                mirror_port = mirror_server.server_address[1]
                mirror_conf = os.path.join(tmp_dir, "freshclam.mirror.conf")
                with open(mirror_conf, "w") as f:
                    f.write(
                        f"PrivateMirror http://host.docker.internal:{mirror_port}\n"
                        "ConnectTimeout 5\nMaxAttempts 2\n"
                    )
                cp = run_cmd(["docker", "cp", mirror_conf, f"{self.container_name}:/etc/clamav/freshclam.conf"])
                self.assertEqual(cp.returncode, 0, f"Failed to seed mirror freshclam.conf: {cp.stderr}")

                start = run_cmd(["docker", "start", self.container_name])
                self.assertEqual(start.returncode, 0, f"Failed to start seeded container: {start.stderr}")

                self.assertTrue(wait_for_ping(self.container_name, 60), "clamd never answered a live PING after seeded startup")
                time.sleep(2)

                initial_loaded = query_loaded_version(self.container_name)
                self.assertIsNotNone(initial_loaded, "Could not parse initial loaded version")
                self.assertEqual(
                    initial_loaded, seed_version,
                    "Precondition not met: clamd did not load the seeded stale version at startup "
                    "(the local-mirror precondition for observing a genuine old->new transition "
                    "was not satisfied) -- this is a missing condition, not a fabricated pass.",
                )
                res = run_cmd(["docker", "exec", self.container_name, "cat", "/var/run/clamav-ready/ready.version"])
                self.assertEqual(res.returncode, 0, "Readiness version marker missing after seeded startup")
                self.assertEqual(res.stdout.strip(), seed_version, "Readiness marker did not publish the seeded stale version")

                # Start the REAL gateway image (operations/artifact-scanner/
                # gateway, unmodified), joined to this container's own
                # network namespace and sharing its readiness-marker
                # directory, for the rest of this test -- R5b.2-lifecycle
                # REOPEN's actual ask: a genuine HTTP caller through
                # gateway/handler.ts, not just direct clamd protocol probes.
                gw = start_gateway_sidecar(
                    self.gateway_image, self.gateway_container_name,
                    self.container_name, ready_dir,
                )
                self.assertEqual(gw.returncode, 0, f"Failed to start gateway sidecar: {gw.stderr}")
                gateway_port = None
                port_deadline = time.time() + 30
                while time.time() < port_deadline:
                    gateway_port = container_published_port(self.container_name, 8080)
                    if gateway_port:
                        break
                    time.sleep(1)
                self.assertIsNotNone(gateway_port, "Gateway's published port 8080 never became available")

                # Restore real connectivity, but leave freshclam's own
                # clamd-notification directive (`NotifyClamd <path-to-clamd.conf>`
                # in the real freshclam.conf.sample -- a path value, not a
                # yes/no boolean) OMITTED, which is its documented default-off
                # state, so the genuine update this triggers writes a newer
                # file to disk WITHOUT instantly reloading the already-running
                # engine -- a real, observable pending/not-yet-activated
                # window, not a timing accident.
                res = run_cmd(["docker", "exec", self.container_name, "sh", "-c",
                                "printf 'DatabaseMirror database.clamav.net\\n' > /etc/clamav/freshclam.conf"])
                self.assertEqual(res.returncode, 0, f"Failed to restore freshclam.conf: {res.stderr}")
            finally:
                # The local mirror is only needed for the initial seeded
                # startup above; the container's freshclam.conf has already
                # been switched to the real DatabaseMirror by this point.
                mirror_server.shutdown()
                mirror_server.server_close()

            # The entrypoint's own watchdog (FRESHCLAM_INTERVAL_SECONDS=5)
            # performs the next freshclam pass and republishes the marker
            # from whatever is genuinely on disk afterward -- the same
            # mechanism the sibling test above already relies on for its
            # "unchanged" assertion, not a new invented path.
            new_expected_version = None
            deadline = time.time() + 60
            while time.time() < deadline:
                res = run_cmd(["docker", "exec", self.container_name, "cat", "/var/run/clamav-ready/ready.version"])
                if res.returncode == 0 and res.stdout.strip() and res.stdout.strip() != seed_version:
                    new_expected_version = res.stdout.strip()
                    break
                time.sleep(2)
            self.assertIsNotNone(
                new_expected_version,
                "Readiness marker never advanced past the seeded stale version -- no genuine "
                "update was available from the live mirror against this seed within the bound",
            )

            # Pending window: the watchdog's freshclam already wrote the
            # newer file and republished the marker/version-file from it,
            # but clamd itself was never notified (NotifyClamd omitted) and
            # SelfCheck (clamd.conf, 1800s) is far away -- so the live
            # engine must still be serving the OLD version right now. This
            # is exactly the readiness.ts#isEngineActivated mismatch the
            # REOPEN review asked this harness to actually produce.
            pending_loaded = query_loaded_version(self.container_name)
            self.assertEqual(
                pending_loaded, seed_version,
                "Expected clamd to still be serving the OLD version during the deliberately "
                "un-notified pending window (NotifyClamd omitted)",
            )
            self.assertNotEqual(
                pending_loaded, new_expected_version,
                "isEngineActivated must see a genuine mismatch during this pending window",
            )

            # R5b.2-lifecycle REOPEN's actual ask: prove the REAL gateway
            # (not just a direct clamd probe) refuses to scan during this
            # exact pending window, through its own HTTP contract
            # (handler.ts: isReady() check before exchange()). A gateway
            # that scanned successfully despite the version mismatch above
            # would fail this assertion; the direct-clamd checks above
            # cannot detect that bug because they never call the gateway at
            # all.
            print("Verifying the real gateway refuses to scan during the pending window...")
            pending_status, pending_body = gateway_scan(gateway_port, b"clean data")
            self.assertEqual(
                pending_status, 503,
                f"Expected the real gateway to refuse a scan while pending (version mismatch), "
                f"got {pending_status}: {pending_body}",
            )
            self.assertIsInstance(pending_body, dict, f"Expected a JSON error body, got {pending_body!r}")
            self.assertEqual(
                pending_body.get("error"), "scan_engine_not_ready",
                f"Expected scan_engine_not_ready during the pending window, got {pending_body}",
            )

            # Force the real, documented clamd RELOAD command (clamd/
            # session.c's zRELOAD) rather than waiting out SelfCheck's
            # 1800s bound or re-adding NotifyClamd for a second genuine
            # update that may not be available.
            res = run_cmd(["docker", "exec", self.container_name, "sh", "-c",
                            "printf 'zRELOAD\\0' | nc -w 3 127.0.0.1 3310"])
            self.assertEqual(res.returncode, 0, f"Failed to issue RELOAD: {res.stderr}")
            time.sleep(3)

            activated_loaded = query_loaded_version(self.container_name)
            self.assertEqual(
                activated_loaded, new_expected_version,
                "clamd did not activate the newer on-disk version after a real RELOAD command",
            )

            # Scans succeed again once genuinely activated, via the exact
            # gateway-facing INSTREAM framing (clamd-protocol.ts#encodeInstream).
            clean_reply = clamd_instream(self.container_name, b"clean data")
            self.assertEqual(clean_reply, "stream: OK", f"Unexpected INSTREAM reply after activation: {clean_reply!r}")
            eicar = r"X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
            eicar_reply = clamd_instream(self.container_name, eicar.encode())
            self.assertRegex(eicar_reply, r"^stream: .+ FOUND$", f"Unexpected INSTREAM reply after activation: {eicar_reply!r}")

            # Same activation, through the real gateway's own HTTP contract:
            # a genuine clean/infected receipt, matching the refusal check
            # above and closing the R5b.2-lifecycle REOPEN gap end-to-end.
            print("Verifying the real gateway serves genuine receipts after activation...")
            clean_status, clean_body = gateway_scan(gateway_port, b"clean data")
            self.assertEqual(
                clean_status, 200,
                f"Expected the real gateway to scan successfully after activation, got "
                f"{clean_status}: {clean_body}",
            )
            self.assertEqual(
                clean_body.get("verdict"), "clean",
                f"Expected a clean verdict from the real gateway after activation, got {clean_body}",
            )
            eicar_gw_status, eicar_gw_body = gateway_scan(gateway_port, eicar.encode())
            self.assertEqual(
                eicar_gw_status, 200,
                f"Expected the real gateway to return a definitive verdict for EICAR after "
                f"activation, got {eicar_gw_status}: {eicar_gw_body}",
            )
            self.assertEqual(
                eicar_gw_body.get("verdict"), "infected",
                f"Expected an infected verdict from the real gateway for EICAR, got {eicar_gw_body}",
            )

            print(
                f"Genuine version transition confirmed: {seed_version} -> {new_expected_version}, "
                "including an observed pending/not-yet-activated window before a real RELOAD, "
                "and real gateway refusal/receipt evidence for both."
            )

# R5b.2-transport REOPEN: the remaining gap the review identified is a REAL
# readiness-success THEN INSTREAM-transport-error path, exercised through
# the actual gateway HTTP contract (handler.ts:135-145), not a substitute
# pre-readiness rejection (operations/verification/verify-dev-artifact-
# backends.py's CLAMD_PORT=1/9999 checks) or a modeled Connector
# (test_gateway_transport_regression.test.ts). gateway/server.ts:15-19
# resolves ONE CLAMD_HOST/CLAMD_PORT config and feeds it to BOTH
# versionClamd (isReady, readiness.ts:48) and exchangeWithClamd (the scan
# itself, handler.ts:142) -- there is no way to make VERSION succeed and
# INSTREAM fail on the exact same TCP endpoint without something between
# the gateway and clamd that treats the two commands differently. This
# test stands up exactly that: a small, protocol-aware TCP relay, run as
# its own container sharing the real clamd container's network namespace
# (the same `--network container:<name>` composition `start_gateway_sidecar`
# already uses for the gateway), which passes clamd's `zVERSION\0`/`zPING\0`
# idle commands straight through to the real clamd untouched, but resets
# the connection immediately for any `zINSTREAM\0` scan request before
# clamd ever sees it. The gateway is pointed at the relay's port instead of
# clamd's own 3310 -- gateway/clamd-transport.ts and handler.ts are not
# modified; only the test-only relay sits on the wire. No Cloud Run TCP
# ingress, public infrastructure or production-source fault branch is
# involved; everything here is container-local Docker networking on the
# GitHub runner, matching this harness's existing write-scope boundary.
RELAY_IMAGE = "python:3.12-alpine"

# Deliberately plain, dependency-free stdlib sockets (no asyncio event loop
# subtleties to reason about for a tiny, bounded number of connections):
# accept a connection, peek at the first bytes the client sent, and either
# proxy the whole bidirectional byte stream to the real clamd (anything
# that is not a scan request) or close immediately without ever dialing
# clamd (a scan request) -- the one and only behavioral difference between
# "VERSION succeeds" and "INSTREAM fails" that this test needs.
RELAY_SCRIPT = """
import socket
import sys
import threading

listen_port = int(sys.argv[1])
target_port = int(sys.argv[2])

def pipe(src, dst):
    try:
        while True:
            chunk = src.recv(65536)
            if not chunk:
                break
            dst.sendall(chunk)
    except OSError:
        pass
    finally:
        try:
            dst.shutdown(socket.SHUT_WR)
        except OSError:
            pass

def handle(conn):
    try:
        conn.settimeout(10)
        first = conn.recv(4096)
    except OSError:
        conn.close()
        return
    if first.startswith(b"zINSTREAM\\0"):
        # Definitive, immediate transport failure for scan requests only:
        # never forwarded to clamd, so no reply (partial or otherwise) is
        # ever possible -- matching clamd-transport.ts#exchangeWithClamd's
        # own close-without-reply rejection branch.
        try:
            conn.setsockopt(
                socket.SOL_SOCKET, socket.SO_LINGER,
                __import__("struct").pack("ii", 1, 0),
            )
        except OSError:
            pass
        conn.close()
        return
    try:
        upstream = socket.create_connection(("127.0.0.1", target_port), timeout=10)
    except OSError:
        conn.close()
        return
    try:
        upstream.sendall(first)
    except OSError:
        conn.close()
        upstream.close()
        return
    t1 = threading.Thread(target=pipe, args=(conn, upstream))
    t2 = threading.Thread(target=pipe, args=(upstream, conn))
    t1.start()
    t2.start()
    t1.join()
    t2.join()
    conn.close()
    upstream.close()

def main():
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(("0.0.0.0", listen_port))
    srv.listen(64)
    while True:
        conn, _ = srv.accept()
        threading.Thread(target=handle, args=(conn,), daemon=True).start()

main()
"""

RELAY_LISTEN_PORT = 3311


def start_clamd_relay(relay_container_name, clamd_container_name, listen_port=RELAY_LISTEN_PORT, target_port=3310):
    """Starts the protocol-aware relay above as its own container, joined
    to `clamd_container_name`'s network namespace exactly like the gateway
    sidecar joins it -- so the relay, clamd and (once started) the gateway
    all reach each other over that one shared loopback, the same topology
    Cloud Run's multi-container instance gives the real gateway/clamd
    pair."""
    return run_cmd([
        "docker", "run", "-d", "--name", relay_container_name,
        "--network", f"container:{clamd_container_name}",
        RELAY_IMAGE, "python3", "-c", RELAY_SCRIPT,
        str(listen_port), str(target_port),
    ])


class TestGenuineGatewayTransportFault(unittest.TestCase):
    def setUp(self):
        self.clamd_image = os.environ.get("CLAMD_IMAGE")
        self.gateway_image = os.environ.get("GATEWAY_IMAGE")
        self.clamd_container_name = "test_gateway_transport_fault_clamd"
        self.relay_container_name = "test_gateway_transport_fault_relay"
        self.gateway_container_name = "test_gateway_transport_fault_gateway"
        if not self.clamd_image:
            self.skipTest("CLAMD_IMAGE environment variable not set")
        if not self.gateway_image:
            self.skipTest("GATEWAY_IMAGE environment variable not set")
        for name in (self.gateway_container_name, self.relay_container_name, self.clamd_container_name):
            run_cmd(["docker", "rm", "-f", name])

    def tearDown(self):
        for name in (self.gateway_container_name, self.relay_container_name, self.clamd_container_name):
            run_cmd(["docker", "rm", "-f", name])

    def test_real_readiness_success_then_instream_transport_failure(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            ready_dir = os.path.join(tmp_dir, "clamav-ready")
            os.makedirs(ready_dir, exist_ok=True)
            os.chmod(ready_dir, 0o777)

            print("Starting real clamd container...")
            res = run_cmd([
                "docker", "run", "-d", "--name", self.clamd_container_name,
                "-p", "0:8080",
                "-v", f"{ready_dir}:/var/run/clamav-ready",
                self.clamd_image,
            ])
            self.assertEqual(res.returncode, 0, f"Failed to start clamd container: {res.stderr}")

            success = wait_for_log(self.clamd_container_name, "updated (version:", 60, "stdout")
            if not success:
                self.fail("Failed to observe initial freshclam update log")
            time.sleep(5)
            self.assertTrue(wait_for_ping(self.clamd_container_name, 60), "clamd never answered a live PING after startup")

            print("Starting protocol-aware relay sharing clamd's network namespace...")
            res = start_clamd_relay(self.relay_container_name, self.clamd_container_name)
            self.assertEqual(res.returncode, 0, f"Failed to start relay: {res.stderr}")

            # The relay must itself be accepting connections before the
            # gateway is pointed at it -- poll its own passthrough path
            # (zPING) directly rather than assuming a fixed startup delay.
            relay_ready = False
            deadline = time.time() + 30
            while time.time() < deadline:
                res = run_cmd([
                    "docker", "exec", self.clamd_container_name, "sh", "-c",
                    f"printf 'zPING\\0' | nc -w 3 127.0.0.1 {RELAY_LISTEN_PORT}",
                ])
                if res.returncode == 0 and "PONG" in res.stdout:
                    relay_ready = True
                    break
                time.sleep(1)
            self.assertTrue(relay_ready, "Relay never answered a passthrough PING via the real clamd")

            print("Starting real gateway pointed at the relay instead of clamd directly...")
            res = start_gateway_sidecar(
                self.gateway_image, self.gateway_container_name,
                self.clamd_container_name, ready_dir,
                clamd_port=RELAY_LISTEN_PORT,
            )
            self.assertEqual(res.returncode, 0, f"Failed to start gateway sidecar: {res.stderr}")

            gateway_port = None
            deadline = time.time() + 30
            while time.time() < deadline:
                gateway_port = container_published_port(self.clamd_container_name, 8080)
                if gateway_port:
                    break
                time.sleep(1)
            self.assertIsNotNone(gateway_port, "Gateway's published port 8080 never became available")

            # Readiness-success half: through the relay's VERSION/PING
            # passthrough, the real gateway must scan successfully -- proof
            # that isReady() (readiness.ts#createIsReady -> versionClamd)
            # genuinely succeeded via this exact relay path, not that the
            # relay merely broke everything indiscriminately.
            print("Verifying the real gateway scans successfully through the relay's passthrough path...")
            ok_status, ok_body = None, None
            deadline = time.time() + 30
            while time.time() < deadline:
                ok_status, ok_body = gateway_scan(gateway_port, b"clean data")
                if ok_status == 200:
                    break
                time.sleep(2)
            self.assertEqual(
                ok_status, 200,
                f"Expected the real gateway to scan successfully through the relay's VERSION/INSTREAM "
                f"passthrough before the fault is engaged, got {ok_status}: {ok_body}",
            )
            self.assertEqual(ok_body.get("verdict"), "clean", f"Expected a clean verdict, got {ok_body}")

            # The actual ask: readiness (VERSION, via the SAME relay/config)
            # keeps succeeding -- the relay never touches non-INSTREAM
            # traffic -- while every INSTREAM scan attempt now fails
            # definitively, through the gateway's own HTTP contract
            # (handler.ts:140-146's isReady()-true-then-exchange()-throws
            # branch), never once falling back to 503 scan_engine_not_ready
            # or a successful 200.
            print("Verifying the real gateway fails closed with scan_engine_unavailable while readiness still succeeds...")
            for payload in (b"clean data", b"clean data", b"clean data"):
                status, body = gateway_scan(gateway_port, payload)
                self.assertEqual(
                    status, 502,
                    f"Expected 502 scan_engine_unavailable for an INSTREAM-only transport fault "
                    f"with readiness still genuinely succeeding, got {status}: {body}",
                )
                self.assertIsInstance(body, dict, f"Expected a JSON error body, got {body!r}")
                self.assertEqual(
                    body.get("error"), "scan_engine_unavailable",
                    f"Expected scan_engine_unavailable, got {body}",
                )

            # Direct confirmation that readiness itself is still succeeding
            # DURING the fault (not merely before it): a live zVERSION query
            # through the relay must still resolve, proving the 502s above
            # are the exchange()-throws branch, not a readiness regression
            # masquerading as it.
            res = run_cmd([
                "docker", "exec", self.clamd_container_name, "sh", "-c",
                f"printf 'zVERSION\\0' | nc -w 3 127.0.0.1 {RELAY_LISTEN_PORT}",
            ])
            self.assertEqual(res.returncode, 0)
            self.assertIn("ClamAV", res.stdout, f"Expected a live VERSION reply via the relay during the fault, got {res.stdout!r}")

            print(
                "Genuine readiness-success-then-INSTREAM-transport-failure path confirmed through "
                "the real gateway's own HTTP contract."
            )

if __name__ == "__main__":
    unittest.main()
