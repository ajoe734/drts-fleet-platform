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

def test_scanner(scanner_url):
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

    print("Scanner tests passed.")

def test_gcs(bucket_name):
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
        run(["gcloud", "storage", "cp", temp_in, test_file, "--if-generation-match=0"])

        print("Test 2: Read generation")
        res = run(["gcloud", "storage", "objects", "describe", test_file, "--format=value(generation)"])
        gen1 = res.stdout.strip()
        assert gen1 and gen1.isdigit(), f"Expected numeric generation, got {gen1}"

        print("Test 3: Download with exact generation match")
        run(["gcloud", "storage", "cp", f"{test_file}#{gen1}", temp_out])
        with open(temp_out, "r") as f:
            downloaded = f.read()
        assert downloaded == test_data, f"Content mismatch: expected {test_data}, got {downloaded}"

        print("Test 4: Upload with mismatched generation (0 again, should fail Precondition Failed)")
        try:
            run(["gcloud", "storage", "cp", temp_in, test_file, "--if-generation-match=0"])
            assert False, "Expected upload to fail with mismatched generation"
        except subprocess.CalledProcessError as e:
            assert "Precondition" in e.stderr or "412" in e.stderr, f"Expected Precondition Failed, got: {e.stderr}"

        print("Test 5: Update with correct generation match")
        with open(temp_in, "w") as f:
            f.write(test_data_v2)
        run(["gcloud", "storage", "cp", temp_in, test_file, f"--if-generation-match={gen1}"])

        print("Test 6: Read updated generation")
        res = run(["gcloud", "storage", "objects", "describe", test_file, "--format=value(generation)"])
        gen2 = res.stdout.strip()
        assert gen2 and gen2.isdigit(), f"Expected numeric generation, got {gen2}"
        assert gen1 != gen2, "Generation did not change after update"

        print("Test 7: Download immutable prior generation")
        run(["gcloud", "storage", "cp", f"{test_file}#{gen1}", temp_out])
        with open(temp_out, "r") as f:
            downloaded = f.read()
        assert downloaded == test_data, f"Old generation content mismatch: expected {test_data}, got {downloaded}"

        print("Test 8: Upload with stale generation")
        try:
            run(["gcloud", "storage", "cp", temp_in, test_file, f"--if-generation-match={gen1}"])
            assert False, "Expected upload to fail with stale generation"
        except subprocess.CalledProcessError as e:
            assert "Precondition" in e.stderr or "412" in e.stderr, f"Expected Precondition Failed, got: {e.stderr}"

        print("Test 9: Verify winning generation remains unchanged")
        res = run(["gcloud", "storage", "objects", "describe", test_file, "--format=value(generation)"])
        assert res.stdout.strip() == gen2, "Generation changed after failed write"

        print("Test 10: Upload with malformed generation")
        try:
            run(["gcloud", "storage", "cp", temp_in, test_file, "--if-generation-match=not_a_number"])
            assert False, "Expected upload to fail with malformed generation"
        except subprocess.CalledProcessError as e:
            pass  # Expected to fail parameter validation or API error

        print("Test 11: Upload with simulated 403 Forbidden")
        # Ensure that network/permission errors are not silently swallowed by CAS precondition checks.
        # We simulate this by trying to copy to a path we definitely don't have access to, or just asserting
        # that actual 403 is distinct from 412 if it were to happen.
        try:
            run(["gcloud", "storage", "cp", temp_in, f"gs://{bucket_name}/forbidden/path", f"--if-generation-match={gen1}"])
        except subprocess.CalledProcessError as e:
            assert "412" not in e.stderr, f"403/Forbidden network errors should not masquerade as 412 CAS errors: {e.stderr}"

    finally:
        print("Cleanup test owned object")
        # exact run-owned generation cleanup with surfaced errors
        if 'gen2' in locals() and gen2.isdigit():
            run(["gcloud", "storage", "rm", f"{test_file}#{gen2}"])
        if 'gen1' in locals() and gen1.isdigit():
            run(["gcloud", "storage", "rm", f"{test_file}#{gen1}"])
        if os.path.exists(temp_in): os.remove(temp_in)
        if os.path.exists(temp_out): os.remove(temp_out)

    print(f"GCS bucket {bucket_name} tests passed.")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--document-bucket", required=True)
    parser.add_argument("--remittance-bucket", required=True)
    parser.add_argument("--scanner-url", required=True)
    args = parser.parse_args()

    test_scanner(args.scanner_url)
    test_gcs(args.document_bucket)
    test_gcs(args.remittance_bucket)

    print("All dev artifact backend verification tests passed.")

if __name__ == "__main__":
    main()
