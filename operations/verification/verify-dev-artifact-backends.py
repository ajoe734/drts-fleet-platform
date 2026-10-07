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

def run(cmd, **kwargs):
    print(f"Running: {' '.join(cmd)}")
    return subprocess.run(cmd, check=True, capture_output=True, text=True, **kwargs)

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
EICAR = CLEAN + b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*\n"
OVERSIZED = CLEAN + b"0" * (11 * 1024 * 1024) # 11 MiB (max is 10 MiB)

import zipfile, io
out = io.BytesIO()
with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as zf:
    zf.writestr("large.txt", b"0" * (11 * 1024 * 1024))
ENGINE_LIMIT_PAYLOAD = out.getvalue()

def test_scanner(scanner_url, scanner_service=None, project=None, region=None):
    print(f"Testing scanner at {scanner_url}")
    token = get_identity_token(scanner_url)

    def scan(content, sha256_header=None):
        req = urllib.request.Request(f"{scanner_url}/scan", data=content, method="POST")
        req.add_header("Authorization", f"Bearer {token}")
        req.add_header("Content-Type", "application/pdf")
        if sha256_header:
            req.add_header("X-Content-SHA256", sha256_header)
        else:
            req.add_header("X-Content-SHA256", hashlib.sha256(content).hexdigest())

        try:
            with urllib.request.urlopen(req, timeout=30) as response:
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
    status, body = scan(CLEAN)
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
    assert status == 200, f"Expected 200, got {status}: {body}"
    assert_receipt(body, ENGINE_LIMIT_PAYLOAD, expected_verdict="infected")

    if scanner_service and project and region:
        import time
        def update_service_env(clamd_port="3310", ready_marker="/var/run/clamav-ready/ready"):
            run([
                "gcloud", "run", "services", "update", scanner_service,
                "--project", project, "--region", region,
                "--set-env-vars", f"CLAMD_HOST=127.0.0.1,CLAMD_PORT={clamd_port},CLAMAV_READY_MARKER={ready_marker}"
            ])
            time.sleep(5)

        try:
            print("Test 5: Readiness rejection (break port)")
            update_service_env(clamd_port="9999")
            status, body = scan(CLEAN)
            assert status == 503, f"Expected 503, got {status}: {body}"
            assert isinstance(body, dict) and body.get("error") == "scan_engine_not_ready", f"Expected scan_engine_not_ready error, got {body}"

            print("Test 6: Readiness rejection (break marker)")
            update_service_env(ready_marker="/invalid/marker")
            status, body = scan(CLEAN)
            assert status == 503, f"Expected 503, got {status}: {body}"
            assert isinstance(body, dict) and body.get("error") == "scan_engine_not_ready", f"Expected scan_engine_not_ready error, got {body}"

            print("Test 7/8: Recovery and verified freshness")
            update_service_env() # restore to defaults
            status, body = scan(CLEAN)
            assert status == 200, f"Expected 200 after recovery, got {status}: {body}"
            assert_receipt(body, CLEAN, expected_verdict="clean")

        finally:
            print("Ensuring service is restored to healthy state")
            update_service_env()
    else:
        print("Test 5: Readiness rejection (break port)")
        print("  [UNEXECUTED] Manual fault injection required in hosted environment")
        print("Test 6: Readiness rejection (break marker)")
        print("  [UNEXECUTED] Manual fault injection required in hosted environment")
        print("Test 7/8: Recovery and verified freshness")
        print("  [UNEXECUTED] Manual verification required in hosted environment")
        return False
    return True

    print("Scanner tests passed (with unexecuted manual genuine-engine scenarios recorded).")

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
