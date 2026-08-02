#!/usr/bin/env python3
"""
Auth Signing Key Rotation CLI & Drill Tool (IAM-KEY-001)

Manages asymmetric and symmetric JWT signing key rings, supporting:
- Inspection of active, previous, and retired keys (with secret masking).
- Generation of new RSA / HMAC signing keys with kid.
- Key rotation drill (active -> previous, new key -> active).
- Key retirement drill (previous -> retired).
- Emergency rollback drill (rollback active key while enforcing strict validation).
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone

try:
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa

    CRYPTOGRAPHY_AVAILABLE = True
except ImportError:
    CRYPTOGRAPHY_AVAILABLE = False


def generate_rsa_key_pair():
    if not CRYPTOGRAPHY_AVAILABLE:
        raise RuntimeError(
            "cryptography package is required to generate RSA keys. Please install cryptography."
        )

    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
    )

    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")

    public_pem = (
        private_key.public_key()
        .public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        .decode("utf-8")
    )

    return private_pem, public_pem


def generate_hmac_secret():
    import secrets

    return secrets.token_hex(32)


def get_utc_now_iso():
    return datetime.now(timezone.utc).isoformat()


def load_key_ring(env_str=None):
    if not env_str:
        env_str = os.environ.get("JWT_KEY_RING_JSON", "")

    if not env_str or not env_str.strip():
        # Fallback to single legacy env vars
        current_kid = os.environ.get("JWT_KID_CURRENT", "key-current")
        priv_key = os.environ.get("JWT_PRIVATE_KEY")
        pub_key = os.environ.get("JWT_PUBLIC_KEY")
        secret = os.environ.get("JWT_SECRET")

        if priv_key or pub_key:
            return [
                {
                    "kid": current_kid,
                    "status": "active",
                    "algorithm": "RS256",
                    "publicKey": pub_key or priv_key,
                    "privateKey": priv_key,
                    "createdAt": get_utc_now_iso(),
                }
            ]
        elif secret:
            return [
                {
                    "kid": current_kid,
                    "status": "active",
                    "algorithm": "HS256",
                    "publicKey": secret,
                    "privateKey": secret,
                    "createdAt": get_utc_now_iso(),
                }
            ]
        return []

    try:
        data = json.loads(env_str)
        if isinstance(data, list):
            return data
    except Exception as e:
        sys.stderr.write(f"Error parsing JWT_KEY_RING_JSON: {e}\n")
    return []


def mask_key_ring(key_ring, show_secrets=False):
    masked = []
    for entry in key_ring:
        item = dict(entry)
        if not show_secrets:
            if item.get("privateKey"):
                item["privateKey"] = "***REDACTED PRIVATE KEY***"
            if item.get("publicKey") and len(item["publicKey"]) > 60:
                item["publicKey"] = item["publicKey"][:30] + "...[REDACTED]"
        masked.append(item)
    return masked


def inspect_cmd(args):
    key_ring = load_key_ring(args.json_ring)
    if not key_ring:
        print("No active key ring found in environment or provided JSON.")
        return

    masked = mask_key_ring(key_ring, show_secrets=args.show_secrets)
    print(json.dumps(masked, indent=2))


def generate_cmd(args):
    kid = args.kid or f"key-{args.alg.lower()}-{datetime.now().strftime('%Y%m%d%H%M%S')}"

    if args.alg.startswith("RS") or args.alg.startswith("ES") or args.alg.startswith("PS"):
        priv, pub = generate_rsa_key_pair()
        record = {
            "kid": kid,
            "status": args.status,
            "algorithm": args.alg,
            "publicKey": pub,
            "privateKey": priv,
            "createdAt": get_utc_now_iso(),
        }
    else:
        sec = generate_hmac_secret()
        record = {
            "kid": kid,
            "status": args.status,
            "algorithm": args.alg,
            "publicKey": sec,
            "privateKey": sec,
            "createdAt": get_utc_now_iso(),
        }

    masked = mask_key_ring([record], show_secrets=args.show_secrets)
    print(f"Generated Key Record ({kid}):")
    print(json.dumps(masked[0] if not args.show_secrets else record, indent=2))


def rotate_cmd(args):
    key_ring = load_key_ring(args.json_ring)
    new_kid = args.new_kid or f"key-rotated-{datetime.now().strftime('%Y%m%d%H%M%S')}"

    # Demote current active keys to previous
    for entry in key_ring:
        if entry.get("status") == "active":
            entry["status"] = "previous"

    if args.alg.startswith("RS") or args.alg.startswith("ES") or args.alg.startswith("PS"):
        priv, pub = generate_rsa_key_pair()
        new_record = {
            "kid": new_kid,
            "status": "active",
            "algorithm": args.alg,
            "publicKey": pub,
            "privateKey": priv,
            "createdAt": get_utc_now_iso(),
        }
    else:
        sec = generate_hmac_secret()
        new_record = {
            "kid": new_kid,
            "status": "active",
            "algorithm": args.alg,
            "publicKey": sec,
            "privateKey": sec,
            "createdAt": get_utc_now_iso(),
        }

    key_ring.insert(0, new_record)

    masked = mask_key_ring(key_ring, show_secrets=False)
    print(f"Rotated Key Ring: New active key is '{new_kid}'")
    print(f"Key Ring Summary: {json.dumps(masked, indent=2)}")
    print("\nUpdated JWT_KEY_RING_JSON env (raw full content for secrets manager):")
    print(json.dumps(key_ring))


def retire_cmd(args):
    key_ring = load_key_ring(args.json_ring)
    target_kid = args.target_kid

    found = False
    for entry in key_ring:
        if entry.get("kid") == target_kid:
            entry["status"] = "retired"
            entry["retiredAt"] = get_utc_now_iso()
            found = True

    if not found:
        sys.stderr.write(f"Key with kid '{target_kid}' not found in key ring.\n")
        sys.exit(1)

    print(f"Retired key '{target_kid}' successfully.")
    print("Updated JWT_KEY_RING_JSON:")
    print(json.dumps(key_ring))


def rollback_cmd(args):
    key_ring = load_key_ring(args.json_ring)
    target_kid = args.target_kid

    found = False
    for entry in key_ring:
        if entry.get("kid") == target_kid:
            entry["status"] = "active"
            found = True
        elif entry.get("status") == "active":
            entry["status"] = "previous"

    if not found:
        sys.stderr.write(f"Key with kid '{target_kid}' not found in key ring.\n")
        sys.exit(1)

    print(f"Emergency Rollback Complete: Key '{target_kid}' is now ACTIVE.")
    print("Strict claim validation (iss, aud, exp, sid) remains enforced.")
    print("Updated JWT_KEY_RING_JSON:")
    print(json.dumps(key_ring))


def main():
    parser = argparse.ArgumentParser(
        description="IAM-KEY-001 Managed Asymmetric Signing Key Rotation Tool"
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # Inspect command
    inspect_parser = subparsers.add_parser("inspect", help="Inspect current key ring")
    inspect_parser.add_argument("--json-ring", help="JSON string of key ring")
    inspect_parser.add_argument(
        "--show-secrets", action="store_true", help="Do not mask secrets"
    )
    inspect_parser.set_defaults(func=inspect_cmd)

    # Generate command
    gen_parser = subparsers.add_parser("generate", help="Generate a new key pair or secret")
    gen_parser.add_argument("--kid", help="Key identifier (optional)")
    gen_parser.add_argument(
        "--alg", default="RS256", help="JWT algorithm (RS256, HS256, etc.)"
    )
    gen_parser.add_argument(
        "--status", default="active", choices=["active", "previous", "retired"]
    )
    gen_parser.add_argument(
        "--show-secrets", action="store_true", help="Print unmasked key material"
    )
    gen_parser.set_defaults(func=generate_cmd)

    # Rotate command
    rotate_parser = subparsers.add_parser("rotate", help="Rotate key ring (create new active key)")
    rotate_parser.add_argument("--new-kid", help="New key identifier")
    rotate_parser.add_argument("--alg", default="RS256", help="JWT algorithm")
    rotate_parser.add_argument("--json-ring", help="Current JSON string of key ring")
    rotate_parser.set_defaults(func=rotate_cmd)

    # Retire command
    retire_parser = subparsers.add_parser("retire", help="Retire a specific key in key ring")
    retire_parser.add_argument("--target-kid", required=True, help="Key ID to retire")
    retire_parser.add_argument("--json-ring", help="Current JSON string of key ring")
    retire_parser.set_defaults(func=retire_cmd)

    # Rollback command
    rollback_parser = subparsers.add_parser(
        "rollback", help="Rollback active key to a previous key"
    )
    rollback_parser.add_argument(
        "--target-kid", required=True, help="Key ID to make active again"
    )
    rollback_parser.add_argument("--json-ring", help="Current JSON string of key ring")
    rollback_parser.set_defaults(func=rollback_cmd)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
