#!/usr/bin/env python3
"""
Verification helper for dev artifact backends.
Verifies GCS bucket functionality (create, read, ifGenerationMatch) and
Scanner functionality (EICAR rejection, clean scan acceptance, hash mismatch rejection, size limits).
"""
import argparse
import hashlib
import json
import os
import subprocess
import sys
import time
import urllib.request
import urllib.error

import re

def _sanitize_stderr(text):
    if not text:
        return text

    # 1. Redact individual tokens and headers
    text = re.sub(r"(?i)^([ \t]*authorization:\s*)[^\n]+", r"\1***REDACTED***", text, flags=re.MULTILINE)
    text = re.sub(r"(?i)^([ \t]*cookie:\s*)[^\n]+", r"\1***REDACTED***", text, flags=re.MULTILINE)
    text = re.sub(r"(?i)\b(bearer|basic)\s+([A-Za-z0-9_.~+/-]+=*)", r"\1 ***REDACTED***", text)
    text = re.sub(r"(?i)ya29\.[a-zA-Z0-9_-]+", "ya29.***REDACTED***", text)
    text = re.sub(r"(?i)ey[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+", "ey***REDACTED***", text)
    
    # Explicit fallback redaction for named keys in case they appear outside blocks
    keys = ["refresh_token", "client_secret", "private_key", "password", "secret", "Authorization", "access_token", "api_key"]
    for k in keys:
        text = re.sub(rf'(?i)("{k}"\s*:\s*")[^"\n\r]+', rf'\1***REDACTED***', text)
        text = re.sub(rf'(?i)({k}=)[^\s&]+', rf'\1***REDACTED***', text)

    # Redact PEM keys
    text = re.sub(r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*", "-----BEGIN PRIVATE KEY-----***REDACTED***", text, flags=re.DOTALL)

    # 2. Fail closed: truncate at any block marker or body
    markers = [
        (r'\{', '{ ***REDACTED BODY*** }'),
        (r'(?i)Request body:', 'Request body: ***REDACTED BODY***'),
        (r'(?i)Response body:', 'Response body: ***REDACTED BODY***'),
        (r'== headers start ==', '== headers start ==\n***REDACTED HEADERS***'),
        (r'==== request start ====', '==== request start ====\n***REDACTED REQUEST***'),
        (r'==== response start ====', '==== response start ====\n***REDACTED RESPONSE***')
    ]
    
    earliest_idx = len(text)
    best_marker = None
    
    for pattern, replacement in markers:
        match = re.search(pattern, text)
        if match and match.start() < earliest_idx:
            earliest_idx = match.start()
            best_marker = replacement
            
    if best_marker:
        text = text[:earliest_idx] + best_marker

    return text

def run(cmd, **kwargs):
    print(f"Running: {' '.join(cmd)}")
    try:
        return subprocess.run(cmd, check=True, capture_output=True, text=True, **kwargs)
    except subprocess.CalledProcessError as e:
        if len(cmd) >= 3 and cmd[0] == "gcloud" and cmd[1] == "logging" and cmd[2] == "read":
            if e.stderr:
                sanitized = _sanitize_stderr(e.stderr).strip()
                if len(sanitized) > 1024:
                    sanitized = sanitized[:1024] + "... [TRUNCATED]"
                print(f"Diagnostic (gcloud logging read failed): {sanitized}", file=sys.stderr)
        raise


def get_identity_token(audience):
    import os
    token = os.environ.get("SCANNER_ID_TOKEN")
    if not token:
        raise ValueError("SCANNER_ID_TOKEN environment variable is required")
    return token

def get_access_token():
    result = run(["gcloud", "auth", "print-access-token"])
    return result.stdout.strip()

CLEAN = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> >>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n200\n%%EOF\n"
# Canonical 68-byte antivirus transport canary, not a structurally valid PDF.
# Keep the EICAR string at byte zero, without a PDF prefix or trailing newline.
# https://www.eicar.org/download-anti-malware-testfile/
EICAR = b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
OVERSIZED = CLEAN + b"0" * (11 * 1024 * 1024) # 11 MiB (max is 10 MiB)

import zipfile, io
out = io.BytesIO()
with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as zf:
    zf.writestr("large.txt", b"0" * (11 * 1024 * 1024))
ENGINE_LIMIT_PAYLOAD = out.getvalue()

SCANNER_INITIAL_READINESS_MAX_ATTEMPTS = int(os.environ.get("SCANNER_INITIAL_READINESS_MAX_ATTEMPTS", "30"))
SCANNER_INITIAL_READINESS_DEADLINE_SECONDS = float(os.environ.get("SCANNER_INITIAL_READINESS_DEADLINE_SECONDS", "120"))
SCANNER_INITIAL_READINESS_POLL_INTERVAL_SECONDS = float(os.environ.get("SCANNER_INITIAL_READINESS_POLL_INTERVAL_SECONDS", "2"))


def wait_for_initial_clean_scan(scan_fn, content):
    """Bounded retry around the very first clean-file scan.

    A cold scanner revision can legitimately answer 503
    scan_engine_not_ready while freshclam/clamd is still loading its
    engine before this helper's first request ever lands -- retry THAT
    exact condition only, up to a finite attempt count and total
    deadline. Any other status/error (auth403, a non-readiness 503, a
    malformed body) returns immediately for the caller to assert on; a
    503 is never treated as success and no negative case is weakened.

    The deadline is checked BEFORE every attempt, not only after a 503
    comes back: checking it only on the trailing edge let an attempt that
    started right at the deadline (its own 503 having landed just inside
    it) still run and return a late, post-deadline clean receipt as a
    pass. The remaining budget is also threaded into `scan_fn` as
    `timeout=`, so a single slow request cannot itself run past the
    deadline, and the poll sleep is capped to whatever budget is left.

    The deadline is checked AGAIN immediately after `scan_fn` returns, for
    the exact same reason a single attempt is given `remaining` instead of
    an unbounded timeout: the `timeout=` passed to `scan_fn` only bounds
    individual socket operations (connect/read), not the attempt's whole
    wall-clock duration -- a response whose headers/body arrive just past
    that per-socket-op budget can still complete and look like a perfectly
    valid 200 receipt. Without this second check, that stale result would
    be accepted as success even though it answered after the deadline had
    already expired.
    """
    deadline = time.monotonic() + SCANNER_INITIAL_READINESS_DEADLINE_SECONDS
    attempt = 0
    last_status, last_body = None, None

    def fail(reason):
        raise AssertionError(
            "Scanner did not become ready for the initial clean scan within "
            f"{attempt} attempt(s) / {SCANNER_INITIAL_READINESS_DEADLINE_SECONDS}s deadline: {reason}"
        )

    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            fail(f"deadline expired before another attempt could start (last status={last_status}, body={last_body})")
        attempt += 1
        status, body = scan_fn(content, timeout=min(remaining, 30))
        last_status, last_body = status, body
        if time.monotonic() > deadline:
            fail(
                "attempt completed after the total deadline had already expired "
                f"(status={status}, body={body}); the supplied timeout bounds a "
                "single socket operation, not the whole call"
            )
        if status != 503 or not isinstance(body, dict) or body.get("error") != "scan_engine_not_ready":
            return status, body
        if attempt >= SCANNER_INITIAL_READINESS_MAX_ATTEMPTS:
            fail(f"last status={status}, body={body}")
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            fail(f"last status={status}, body={body}")
        time.sleep(min(SCANNER_INITIAL_READINESS_POLL_INTERVAL_SECONDS, remaining))


def test_scanner(scanner_url, scanner_service=None, project=None, region=None):
    print(f"Testing scanner at {scanner_url}")
    token = get_identity_token(scanner_url)

    def scan(content, sha256_header=None, timeout=30):
        req = urllib.request.Request(f"{scanner_url}/scan", data=content, method="POST")
        req.add_header("Authorization", f"Bearer {token}")
        req.add_header("Content-Type", "application/pdf")
        if sha256_header:
            req.add_header("X-Content-SHA256", sha256_header)
        else:
            req.add_header("X-Content-SHA256", hashlib.sha256(content).hexdigest())

        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                return response.status, json.loads(response.read().decode())
        except urllib.error.HTTPError as e:
            try:
                body = json.loads(e.read().decode())
            except:
                body = e.read().decode()
            return e.code, body

    def assert_receipt(body, content, expected_verdict=None, expected_error=None):
        sha256 = hashlib.sha256(content).hexdigest()
        assert body.get("sha256") == sha256, f"Expected sha256 {sha256}, got {body.get('sha256')}"
        assert body.get("sizeBytes") == len(content), f"Expected size {len(content)}, got {body.get('sizeBytes')}"
        if expected_verdict:
            assert body.get("verdict") == expected_verdict, f"Expected verdict {expected_verdict}, got {body.get('verdict')}"
        if expected_error:
            assert body.get("error") == expected_error, f"Expected error {expected_error}, got {body.get('error')}"

    print("Test 1: Clean file")
    status, body = wait_for_initial_clean_scan(scan, CLEAN)
    assert status == 200, f"Expected 200, got {status}: {body}"
    assert_receipt(body, CLEAN, expected_verdict="clean")

    print("Test 2: EICAR file")
    status, body = scan(EICAR)
    assert status == 200, f"Expected 200, got {status}: {body}"
    assert_receipt(body, EICAR, expected_verdict="infected")

    print("Test 3: Hash mismatch")
    status, body = scan(CLEAN, sha256_header="0000000000000000000000000000000000000000000000000000000000000000")
    assert status == 400, f"Expected 400, got {status}: {body}"
    assert body.get("error") == "content_sha256_mismatch", f"Expected error content_sha256_mismatch, got {body.get('error')}"

    print("Test 4: Oversized file")
    status, body = scan(OVERSIZED)
    assert status == 413, f"Expected 413, got {status}: {body}"
    assert body.get("error") == "payload_too_large", f"Expected payload_too_large error, got {body.get('error')}"

    print("Test 4b: Engine-limit rejection (archive >10MiB uncompressed)")
    status, body = scan(ENGINE_LIMIT_PAYLOAD)
    assert status == 502, f"Expected 502, got {status}: {body}"
    assert isinstance(body, dict) and body.get("error") == "scan_engine_indeterminate", f"Expected error scan_engine_indeterminate, got {body.get('error')}"


    if scanner_service and project and region:
        import time
        import uuid

        # Capture original env config for restoration
        res = run([
            "gcloud", "run", "services", "describe", scanner_service,
            "--project", project, "--region", region,
            "--format=json"
        ])
        service_desc = json.loads(res.stdout)
        original_env_by_container = {}
        if isinstance(service_desc, list): service_desc = service_desc[0] if service_desc else {}
        if "template" in service_desc.get("spec", {}):
            containers = service_desc["spec"]["template"].get("spec", {}).get("containers", [])
            for c in containers:
                c_name = c.get("name")
                if not c_name: continue
                c_env = {}
                for env in c.get("env", []):
                    if "value" in env:
                        c_env[env["name"]] = env["value"]
                original_env_by_container[c_name] = c_env

        mutated_keys = ["MAX_SIGNATURE_AGE_MS", "CLAMD_PORT", "COLD_START_NONCE", "FRESHCLAM_INTERVAL_SECONDS", "http_proxy"]
        original_max_age = original_env_by_container.get("gateway", {}).get("MAX_SIGNATURE_AGE_MS", "")
        original_clamd_port = original_env_by_container.get("gateway", {}).get("CLAMD_PORT", "")

        def update_service_env(container="gateway", remove=False, **kwargs):
            cmd = [
                "gcloud", "run", "services", "update", scanner_service,
                "--project", project, "--region", region,
                "--container", container
            ]
            if remove:
                keys = ",".join(kwargs.keys())
                cmd.extend(["--remove-env-vars", keys])
            else:
                env_vars_str = ",".join([f"{k}={v}" for k, v in kwargs.items()])
                cmd.extend(["--update-env-vars", env_vars_str])
            res = run(cmd)
            out = run(["gcloud", "run", "services", "describe", scanner_service, "--project", project, "--region", region, "--format=value(status.latestCreatedRevisionName)"])
            return out.stdout.strip()

        unexecuted = False
        restoration_failed = False

        try:
            print("Test 5: Readiness rejection (stale signatures)")
            rev_5 = update_service_env(container="gateway", MAX_SIGNATURE_AGE_MS="1")
            time.sleep(5)
            status, body = scan(CLEAN)
            assert status == 503, f"Expected 503, got {status}: {body}"
            assert isinstance(body, dict) and body.get("error") == "scan_engine_not_ready", f"Expected scan_engine_not_ready error, got {body}"

            print("Test 6: Readiness failure due to unavailable port")
            # Clear MAX_SIGNATURE_AGE_MS so it's not the cause of failure
            if original_max_age:
                update_service_env(container="gateway", CLAMD_PORT="9999", MAX_SIGNATURE_AGE_MS=original_max_age)
            else:
                update_service_env(container="gateway", remove=True, MAX_SIGNATURE_AGE_MS="")
                update_service_env(container="gateway", CLAMD_PORT="9999")
            time.sleep(5)
            status, body = scan(CLEAN)
            assert status == 503, f"Expected 503 for broken readiness, got {status}: {body}"
            assert isinstance(body, dict) and body.get("error") == "scan_engine_not_ready", f"Expected scan_engine_not_ready error, got {body}"

            print("Test 7/8: Cold-start recovery, failed/pending-to-activated transition, and freshclam verification")
            nonce = uuid.uuid4().hex[:8]
            # Restore age, fix port, and force cold start
            update_env = {"MAX_SIGNATURE_AGE_MS": original_max_age if original_max_age else "21600000", "COLD_START_NONCE": nonce}
            if original_clamd_port:
                update_env["CLAMD_PORT"] = original_clamd_port
            else:
                update_service_env(container="gateway", remove=True, CLAMD_PORT="")

            rev_7 = update_service_env(container="gateway", **update_env)

            # Observe pending state
            print("  Polling for readiness...")
            max_attempts = 60
            ready = False
            pending_observed = False
            for i in range(max_attempts):
                status, body = scan(CLEAN)
                if status == 503:
                    if isinstance(body, dict) and body.get("error") == "scan_engine_not_ready":
                        pending_observed = True
                    elif pending_observed:
                        # Already saw pending, this might be another pending or an error
                        pass
                elif status == 200:
                    assert_receipt(body, CLEAN, expected_verdict="clean")
                    ready = True
                    break
                time.sleep(2)

            assert pending_observed, "Service did not exhibit pending (503) state during cold start"
            assert ready, "Service did not become ready after cold start"

            status, body = scan(EICAR)
            assert status == 200, f"Expected 200 after recovery, got {status}: {body}"
            assert_receipt(body, EICAR, expected_verdict="infected")

            print("  Verifying Cloud Run logs for freshclam output and loaded version...")
            res = run([
                "gcloud", "logging", "read",
                f'resource.type="cloud_run_revision" AND resource.labels.service_name="{scanner_service}" AND resource.labels.revision_name="{rev_7}" AND textPayload:"Fetching ClamAV signatures"',
                "--project", project,
                "--limit=1", "--format=json"
            ])
            logs = json.loads(res.stdout) if res.stdout.strip() else []
            assert len(logs) > 0, "Could not find 'Fetching ClamAV signatures' in logs for exact revision"

            res_fresh = run([
                "gcloud", "logging", "read",
                f'resource.type="cloud_run_revision" AND resource.labels.service_name="{scanner_service}" AND resource.labels.revision_name="{rev_7}" AND (textPayload:"database is up-to-date" OR textPayload:"updated (version:")',
                "--project", project,
                "--limit=1", "--format=json"
            ])
            logs_fresh = json.loads(res_fresh.stdout) if res_fresh.stdout.strip() else []
            assert len(logs_fresh) > 0, "Could not find confirmed daily database version/freshness in logs for exact revision"

            print("Test 9: Fail-closed after a previously-healthy deployment loses engine connectivity")
            # CLAMD_TIMEOUT_MS=1 used to race isReady()'s zVERSION probe
            # against the scan's own INSTREAM exchange on the exact same
            # deadline: gateway/server.ts:15-19 reads both into ONE `clamd`
            # config object, and handler.ts:135-142 calls isReady() then
            # exchange() against that same object within the same request --
            # a fast local loopback round-trip could let either command
            # genuinely finish inside 1ms, so this polling loop used to
            # silently ignore an occasional 200 (a real successful receipt
            # during what was supposed to be the fault window) instead of
            # failing on it.
            #
            # A deterministic fault requires isReady() to independently stay
            # true while the exchange() call on that SAME request fails --
            # impossible to arrange from here without either changing
            # gateway/server.ts (out of this task's write_scopes; the
            # FAULT_INJECT_TRANSPORT branch proposed in a prior round is a
            # production-source change still awaiting scope authorization)
            # or standing up new reachable infrastructure the gateway could
            # dial into with divergent per-command behavior (blocked: no VM
            # hosting, and Cloud Run has no raw-TCP ingress to proxy a
            # clamd-protocol responder). `clamd` is also captured ONCE at
            # process start (module scope), so an env update only ever takes
            # effect on a brand-new, cold revision that re-evaluates
            # isReady() against the very same broken config from its first
            # request -- there is no already-ready instance to break
            # mid-flight. The exact isReady()-true-then-exchange()-throws
            # branch (502 scan_engine_unavailable) is instead proven
            # deterministically against this real, unmodified handler.ts/
            # clamd-transport.ts composition by this task's
            # test_gateway_transport_regression.test.ts, which injects a
            # fake Connector that answers VERSION but resets INSTREAM.
            #
            # What this hosted check proves instead: the REAL deployed
            # service -- which Test 7/8 just confirmed is healthy and
            # scanning clean/EICAR correctly -- fails closed end-to-end,
            # deterministically and immediately (no timeout race), once its
            # only configured path to the engine becomes genuinely
            # unreachable, and never serves a single successful verdict
            # while that fault is in effect. Port "1" (distinct from Test
            # 6's "9999" so evidence/logs are unambiguous about which test
            # induced which revision) is a reserved port nothing in this
            # image listens on, so every connection attempt gets an
            # immediate ECONNREFUSED rather than waiting out a timeout.
            rev_9 = update_service_env(container="gateway", CLAMD_PORT="1")

            max_attempts = 30
            observed_fault = False
            for i in range(max_attempts):
                status, body = scan(CLEAN)
                assert status != 200, f"Unexpected successful scan while the transport fault is active: {status}: {body}"
                if status == 503 and isinstance(body, dict) and body.get("error") == "scan_engine_not_ready":
                    observed_fault = True
                    break
                assert status == 503, f"Unexpected status while waiting for the new revision to take effect: {status}: {body}"
                time.sleep(2)

            assert observed_fault, "Service never entered the fail-closed state after the transport fault was injected"

            # Hold the fault for several more requests against BOTH payload
            # types and assert every single observed response stays
            # fail-closed -- not just the first one -- so a transient or
            # flaky "ready" response cannot slip through this check the way
            # the old polling loop let a successful fault-period receipt
            # slip through unasserted.
            for i in range(5):
                for payload in (CLEAN, EICAR):
                    status, body = scan(payload)
                    assert status == 503 and isinstance(body, dict) and body.get("error") == "scan_engine_not_ready", (
                        f"Expected a sustained fail-closed 503 while the transport fault is active, got {status}: {body}"
                    )
                time.sleep(1)

            # Recovery after fault
            if original_clamd_port:
                update_service_env(container="gateway", CLAMD_PORT=original_clamd_port)
            else:
                update_service_env(container="gateway", remove=True, CLAMD_PORT="")

            print("  (The exact isReady()-true-then-exchange()-throws 502 branch is proven deterministically, "
                  "against this real unmodified handler.ts/clamd-transport.ts, by "
                  "test_gateway_transport_regression.test.ts's fake-Connector Vitest coverage; the genuine "
                  "engine lifecycle is tested in a separate workflow step via test_genuine_clamd_lifecycle.py)")
        except Exception as e:
            print(f"Hosted scenario failed: {e}")
            raise
        finally:
            print("Ensuring service is restored to healthy state")
            try:
                # restore original env exactly for both containers
                restore_errors = []
                for c_name in ["gateway", "clamd"]:
                    c_orig = original_env_by_container.get(c_name, {})
                    to_remove = []
                    updates = {}
                    for key in mutated_keys:
                        if key in c_orig:
                            updates[key] = c_orig[key]
                        else:
                            to_remove.append(key)

                    cmd = [
                        "gcloud", "run", "services", "update", scanner_service,
                        "--project", project, "--region", region,
                        "--container", c_name
                    ]
                    if to_remove:
                        cmd.extend(["--remove-env-vars", ",".join(to_remove)])

                    if updates:
                        cmd.extend(["--update-env-vars", ",".join([f"{k}={v}" for k, v in updates.items()])])

                    try:
                        if to_remove or updates:
                            import subprocess
                            subprocess.run(cmd, capture_output=True, text=True, check=True)
                    except subprocess.CalledProcessError as e:
                        restore_errors.append(f"Container {c_name} restore failed: {e.stderr}")

                if restore_errors:
                    raise subprocess.CalledProcessError(1, "restore", stderr="\\n"
.join(restore_errors))

                # wait for readiness
                ready = False
                for _ in range(60):
                    status, _ = scan(CLEAN)
                    if status == 200:
                        ready = True
                        break
                    import time
                    time.sleep(2)
                if not ready:
                    raise Exception("Service not healthy (timed out waiting for readiness) after restore")

                # verify healthy and assert receipts
                status, body = scan(CLEAN)
                if status != 200:
                    raise Exception(f"Service not healthy after restore, status {status}")
                assert_receipt(body, CLEAN, expected_verdict="clean")

                status, body = scan(EICAR)
                if status != 200:
                    raise Exception(f"Service EICAR not healthy after restore, status {status}")
                assert_receipt(body, EICAR, expected_verdict="infected")
            except subprocess.CalledProcessError as e:
                restoration_failed = True
                print(f"Failed to restore scanner config: {e.stderr}")
                raise Exception(f"Failed to restore scanner config: {e.stderr}") from e
            except Exception as e:
                restoration_failed = True
                print(f"Service failed health check post-restoration: {e}")
                raise Exception(f"Service failed health check post-restoration: {e}") from e

        if unexecuted:
            print("Scanner tests passed (with unexecuted manual genuine-engine scenarios recorded).")
            return False

    else:
        print("Test 5: Readiness rejection (stale signatures)")
        print("  [UNEXECUTED] Hosted environment required")
        print("Test 6: Genuine unavailable transport path")
        print("  [UNEXECUTED] Hosted environment required")
        print("Test 7/8: Cold-start recovery, failed/pending-to-activated transition, and freshclam verification")
        print("  [UNEXECUTED] Hosted environment required")
        return False

    return True
def test_gcs(bucket_name, runtime_sa):
    print(f"Testing GCS bucket: {bucket_name}")
    import uuid
    import subprocess
    import tempfile

    test_key = f"verify-test-{int(time.time())}-{uuid.uuid4().hex[:8]}.txt"
    test_file = f"gs://{bucket_name}/{test_key}"
    temp_dir = tempfile.gettempdir()
    temp_in = os.path.join(temp_dir, f"temp_in_{test_key}")
    temp_out = os.path.join(temp_dir, f"temp_out_{test_key}")

    test_data = "test data v1"
    test_data_v2 = "test data v2"

    with open(temp_in, "w") as f:
        f.write(test_data)

    try:
        print("Test 1: Upload (create with if-generation-match=0)")
        run(["gcloud", f"--impersonate-service-account={runtime_sa}", "storage", "cp", temp_in, test_file, "--if-generation-match=0"])

        print("Test 2: Read generation")
        res = run(["gcloud", f"--impersonate-service-account={runtime_sa}", "storage", "objects", "describe", test_file, "--format=value(generation)"])
        gen1 = res.stdout.strip()
        assert gen1 and gen1.isdigit(), f"Expected numeric generation, got {gen1}"

        print("Test 3: Download with exact generation match")
        run(["gcloud", f"--impersonate-service-account={runtime_sa}", "storage", "cp", f"{test_file}#{gen1}", temp_out])
        with open(temp_out, "r") as f:
            downloaded = f.read()
        assert downloaded == test_data, f"Content mismatch: expected {test_data}, got {downloaded}"

        print("Test 4: Upload with mismatched generation (0 again, should fail Precondition Failed)")
        try:
            run(["gcloud", f"--impersonate-service-account={runtime_sa}", "storage", "cp", temp_in, test_file, "--if-generation-match=0"])
            assert False, "Expected upload to fail with mismatched generation"
        except subprocess.CalledProcessError as e:
            assert "Precondition" in e.stderr or "412" in e.stderr, f"Expected Precondition Failed, got: {e.stderr}"

        print("Test 5: Update with correct generation match")
        with open(temp_in, "w") as f:
            f.write(test_data_v2)
        run(["gcloud", f"--impersonate-service-account={runtime_sa}", "storage", "cp", temp_in, test_file, f"--if-generation-match={gen1}"])

        print("Test 6: Read updated generation")
        res = run(["gcloud", f"--impersonate-service-account={runtime_sa}", "storage", "objects", "describe", test_file, "--format=value(generation)"])
        gen2 = res.stdout.strip()
        assert gen2 and gen2.isdigit(), f"Expected numeric generation, got {gen2}"
        assert gen1 != gen2, "Generation did not change after update"

        print("Test 6b: Download and assert gen2 bytes")
        run(["gcloud", f"--impersonate-service-account={runtime_sa}", "storage", "cp", f"{test_file}#{gen2}", temp_out])
        with open(temp_out, "r") as f:
            downloaded = f.read()
        assert downloaded == test_data_v2, f"Gen2 content mismatch: expected {test_data_v2}, got {downloaded}"

        print("Test 7: Download immutable prior generation")
        run(["gcloud", f"--impersonate-service-account={runtime_sa}", "storage", "cp", f"{test_file}#{gen1}", temp_out])
        with open(temp_out, "r") as f:
            downloaded = f.read()
        assert downloaded == test_data, f"Old generation content mismatch: expected {test_data}, got {downloaded}"

        print("Test 8: Upload with stale generation")
        try:
            run(["gcloud", f"--impersonate-service-account={runtime_sa}", "storage", "cp", temp_in, test_file, f"--if-generation-match={gen1}"])
            assert False, "Expected upload to fail with stale generation"
        except subprocess.CalledProcessError as e:
            assert "Precondition" in e.stderr or "412" in e.stderr, f"Expected Precondition Failed, got: {e.stderr}"

        print("Test 9: Verify winning generation remains unchanged")
        res = run(["gcloud", f"--impersonate-service-account={runtime_sa}", "storage", "objects", "describe", test_file, "--format=value(generation)"])
        assert res.stdout.strip() == gen2, "Generation changed after failed write"

        run(["gcloud", f"--impersonate-service-account={runtime_sa}", "storage", "cp", f"{test_file}#{gen2}", temp_out])
        with open(temp_out, "r") as f:
            downloaded = f.read()
        assert downloaded == test_data_v2, f"Winning generation content was modified: expected {test_data_v2}, got {downloaded}"

        print("Test 10: Upload with malformed generation")
        try:
            run(["gcloud", f"--impersonate-service-account={runtime_sa}", "storage", "cp", temp_in, test_file, "--if-generation-match=not_a_number"])
            assert False, "Expected upload to fail with malformed generation"
        except subprocess.CalledProcessError as e:
            pass  # Expected to fail parameter validation or API error

        print("Test 11: Upload to absent path with mismatched generation")
        absent_file = f"{test_file}-absent"
        try:
            run(["gcloud", f"--impersonate-service-account={runtime_sa}", "storage", "cp", temp_in, absent_file, f"--if-generation-match={gen1}"])
            assert False, "Expected upload to absent path with generation match to fail"
        except subprocess.CalledProcessError as e:
            assert "412" in e.stderr or "Precondition Failed" in e.stderr, f"Absent object with CAS should return 412 Precondition Failed, got: {e.stderr}"

        print("Test 12: Network fault / permission denial regressions")
        try:
            run(["gcloud", "storage", "cp", temp_in, test_file, "--if-generation-match=0", "--access-token-file=/dev/null"])
            assert False, "Expected upload to fail with invalid token"
        except subprocess.CalledProcessError as e:
            assert "401" in e.stderr or "403" in e.stderr or "Unauthorized" in e.stderr or "Authentication required" in e.stderr, f"Expected external denial (401/403/Unauthorized), got: {e.stderr}"

        print("Test 12b: Post-fault recovery readback")
        # Prove that we can still read normally and generation is intact
        res = run(["gcloud", f"--impersonate-service-account={runtime_sa}", "storage", "objects", "describe", test_file, "--format=value(generation)"])
        assert res.stdout.strip() == gen2, f"Recovery failed, generation changed or read failed: expected {gen2}"
        # And verify the bytes
        run(["gcloud", f"--impersonate-service-account={runtime_sa}", "storage", "cp", f"{test_file}#{gen2}", temp_out])
        with open(temp_out, "r") as f:
            downloaded = f.read()
        assert downloaded == test_data_v2, f"Gen2 content mismatch after fault: expected {test_data_v2}, got {downloaded}"


    finally:
        print("Cleanup test owned object")
        # exact run-owned generation cleanup with surfaced errors
        if 'gen2' in locals() and gen2.isdigit():
            run(["gcloud", f"--impersonate-service-account={runtime_sa}", "storage", "rm", f"{test_file}#{gen2}"])
        if 'gen1' in locals() and gen1.isdigit():
            run(["gcloud", f"--impersonate-service-account={runtime_sa}", "storage", "rm", f"{test_file}#{gen1}"])
        if os.path.exists(temp_in): os.remove(temp_in)
        if os.path.exists(temp_out): os.remove(temp_out)

    print(f"GCS bucket {bucket_name} tests passed.")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--document-bucket", required=True)
    parser.add_argument("--remittance-bucket", required=True)
    parser.add_argument("--scanner-url", required=True)
    parser.add_argument("--runtime-sa", required=True)
    parser.add_argument("--scanner-service", required=False)
    parser.add_argument("--project", required=False)
    parser.add_argument("--region", required=False)
    args = parser.parse_args()

    engine_tested = test_scanner(args.scanner_url, args.scanner_service, args.project, args.region)
    test_gcs(args.document_bucket, args.runtime_sa)
    test_gcs(args.remittance_bucket, args.runtime_sa)

    if not engine_tested:
        print("Scanner tests passed (with unexecuted manual genuine-engine scenarios).")
        sys.exit(1)

    print("All dev artifact backend verification tests passed.")

if __name__ == "__main__":
    main()
