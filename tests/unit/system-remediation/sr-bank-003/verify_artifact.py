#!/usr/bin/env python3
"""
DRTS Independent Bank Artifact Verification Tool
Verifies artifact actual bytes SHA-256 digest and RSASSA-PKCS1-v1_5 digital signature.
Acceptance Reference: SR-BANK-003 (R14 / C083)
"""

import sys
import os
import hashlib
import base64
import subprocess
import tempfile
import argparse

DELIMITER = (
    "--------------------------------------------------------------------------------\n"
    "DIGITAL SIGNATURE & AUDIT MANIFEST\n"
    "--------------------------------------------------------------------------------"
)


def parse_artifact(text: str):
    idx = text.find(DELIMITER)
    if idx == -1:
        raise ValueError("Missing manifest delimiter in artifact")
    payload = text[:idx].rstrip("\r\n")
    manifest_raw = text[idx + len(DELIMITER) :]

    fields = {}
    for line in manifest_raw.splitlines():
        line = line.strip()
        if not line or line.startswith("=") or line.startswith("-"):
            continue
        if ":" in line:
            key, val = line.split(":", 1)
            fields[key.strip()] = val.strip()

    return payload, fields


def verify_artifact_file(artifact_path: str, pubkey_path: str = None) -> bool:
    with open(artifact_path, "r", encoding="utf-8") as f:
        content = f.read()

    payload, manifest = parse_artifact(content)

    manifest_hash_field = manifest.get("Manifest Hash", "")
    expected_hex = manifest_hash_field.replace("sha256:", "").strip().lower()

    # 1. Compute SHA-256 of actual UTF-8 payload bytes
    payload_bytes = payload.encode("utf-8")
    actual_hex = hashlib.sha256(payload_bytes).hexdigest().lower()

    hash_match = actual_hex == expected_hex
    print(f"[*] Artifact: {artifact_path}")
    print(f"[*] Payload size: {len(payload_bytes)} bytes")
    print(f"[*] Expected SHA-256: {expected_hex}")
    print(f"[*] Actual SHA-256:   {actual_hex}")
    print(f"[*] SHA-256 Match:    {'PASSED' if hash_match else 'FAILED (TAMPERED)'}")

    if not hash_match:
        print("[!] Content tampering or corruption detected: payload digest mismatch!")
        return False

    status = manifest.get("Signature Status", "UNSIGNED")
    algorithm = manifest.get("Signature Algorithm", "NONE")
    signature = manifest.get("Digital Signature", "")
    key_id = manifest.get("Key ID", "NONE")

    print(f"[*] Signature Status: {status}")
    print(f"[*] Algorithm:        {algorithm}")
    print(f"[*] Key ID:           {key_id}")

    if status == "UNSIGNED":
        if "VALID" in signature or signature.startswith("SIG_"):
            print(f"[!] Defect detected: unsigned artifact contains fake validity marker '{signature}'")
            return False
        print("[+] Artifact SHA-256 verified successfully (Explicitly UNSIGNED).")
        return True

    elif status == "SIGNED":
        if not pubkey_path:
            print("[!] Artifact is SIGNED but no public key was supplied via --public-key.")
            return False

        if not os.path.exists(pubkey_path):
            print(f"[!] Public key file not found: {pubkey_path}")
            return False

        # Verify signature using OpenSSL dgst
        with tempfile.TemporaryDirectory() as tmpdir:
            payload_file = os.path.join(tmpdir, "payload.txt")
            sig_file = os.path.join(tmpdir, "sig.bin")

            with open(payload_file, "wb") as pf:
                pf.write(payload_bytes)

            try:
                sig_bytes = base64.b64decode(signature)
            except Exception as e:
                print(f"[!] Failed to base64-decode signature: {e}")
                return False

            with open(sig_file, "wb") as sf:
                sf.write(sig_bytes)

            cmd = [
                "openssl",
                "dgst",
                "-sha256",
                "-verify",
                pubkey_path,
                "-signature",
                sig_file,
                payload_file,
            ]

            proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if proc.returncode == 0 and "Verified OK" in proc.stdout:
                print("[+] OpenSSL Cryptographic Signature Verification: PASSED (Verified OK)")
                return True
            else:
                print(f"[!] OpenSSL Signature Verification: FAILED\n{proc.stderr}")
                return False
    else:
        print(f"[!] Unrecognized Signature Status: {status}")
        return False


def main():
    parser = argparse.ArgumentParser(description="DRTS Independent Bank Artifact Verifier")
    parser.add_argument("artifact", help="Path to artifact file (.txt)")
    parser.add_argument("--public-key", dest="pubkey", help="Path to RSA public key (.pem)")
    args = parser.parse_args()

    success = verify_artifact_file(args.artifact, args.pubkey)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
