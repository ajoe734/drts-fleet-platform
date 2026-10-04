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
    result = run(["gcloud", "auth", "print-identity-token", f"--audiences={audience}"])
    return result.stdout.strip()

def get_access_token():
    result = run(["gcloud", "auth", "print-access-token"])
    return result.stdout.strip()

EICAR = b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
CLEAN = b"This is a clean file for testing."
OVERSIZED = b"0" * (11 * 1024 * 1024) # 11 MiB (max is 10 MiB)

def test_scanner(scanner_url):
    print(f"Testing scanner at {scanner_url}")
    token = get_identity_token(scanner_url)
    
    def scan(content, sha256_header=None):
        req = urllib.request.Request(f"{scanner_url}/scan", data=content, method="POST")
        req.add_header("Authorization", f"Bearer {token}")
        req.add_header("Content-Type", "application/octet-stream")
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

    print("Test 1: Clean file")
    status, body = scan(CLEAN)
    assert status == 200, f"Expected 200, got {status}: {body}"
    assert body.get("verdict") == "clean", f"Expected verdict clean, got {body}"
    
    print("Test 2: EICAR file")
    status, body = scan(EICAR)
    assert status == 200, f"Expected 200, got {status}: {body}"
    assert body.get("verdict") == "infected", f"Expected verdict infected, got {body}"
    
    print("Test 3: Hash mismatch")
    status, body = scan(CLEAN, sha256_header="0000000000000000000000000000000000000000000000000000000000000000")
    assert status == 400, f"Expected 400, got {status}: {body}"
    
    print("Test 4: Oversized file")
    status, body = scan(OVERSIZED)
    assert status == 413 or status == 400, f"Expected 413 or 400, got {status}: {body}"

    print("Scanner tests passed.")

def test_gcs(bucket_name):
    print(f"Testing GCS bucket: {bucket_name}")
    # We will use gcloud storage for CAS/generation readback
    test_file = f"gs://{bucket_name}/verify-test-{int(time.time())}.txt"
    
    with open("temp_test.txt", "w") as f:
        f.write("test data")
        
    print("Test 1: Upload (create)")
    run(["gcloud", "storage", "cp", "temp_test.txt", test_file, "--if-generation-match=0"])
    
    print("Test 2: Read generation")
    res = run(["gcloud", "storage", "objects", "describe", test_file, "--format=value(generation)"])
    gen = res.stdout.strip()
    assert gen, "Expected a generation number"
    
    print("Test 3: Download with generation match")
    run(["gcloud", "storage", "cp", f"{test_file}#{gen}", "temp_download.txt"])
    
    print("Test 4: Upload with mismatched generation (should fail)")
    try:
        run(["gcloud", "storage", "cp", "temp_test.txt", test_file, "--if-generation-match=0"])
        assert False, "Expected upload to fail with mismatched generation"
    except subprocess.CalledProcessError:
        pass # Expected
        
    print("Test 5: Cleanup test owned object")
    run(["gcloud", "storage", "rm", test_file])
    
    os.remove("temp_test.txt")
    os.remove("temp_download.txt")
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
