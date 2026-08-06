#!/usr/bin/env python3
"""
Internal Key Exception Registry Verification Script (IAM-SVC-002)

Validates static inventory metadata integrity:
1. Complete metadata for every internal-key exception (owner, purpose, scope, TTL, network boundary, rotation cadence, usage signal, removal date, removal plan).
2. Expiration status of exceptions against current UTC time.
3. Documentation alignment between docs/02-architecture/internal-key-exceptions.md and machine-readable registry.
"""

import datetime
import json
import os
import re
import sys

REQUIRED_METADATA_FIELDS = [
    "exceptionId",
    "owner",
    "purpose",
    "scope",
    "ttl",
    "expiresAt",
    "networkBoundary",
    "rotationCadence",
    "usageSignal",
    "removalDate",
    "removalPlan",
    "header",
    "envVar",
]

DOC_PATH = "docs/02-architecture/internal-key-exceptions.md"
REGISTRY_PATH = "apps/api/src/common/auth/internal-key-exception-registry.ts"

def load_doc_exceptions(doc_file_path: str):
    if not os.path.exists(doc_file_path):
        print(f"FAIL: Documentation file missing: {doc_file_path}")
        return []

    with open(doc_file_path, "r", encoding="utf-8") as f:
        content = f.read()

    excp_matches = re.findall(r"`(INTERNAL_KEY_EXCP_\d+)`", content)
    unique_excps = sorted(list(set(excp_matches)))
    return unique_excps

def load_ts_registry_exceptions(ts_file_path: str):
    if not os.path.exists(ts_file_path):
        print(f"FAIL: TypeScript registry file missing: {ts_file_path}")
        return []

    with open(ts_file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Find array content of INTERNAL_KEY_EXCEPTION_REGISTRY
    registry_match = re.search(r"INTERNAL_KEY_EXCEPTION_REGISTRY.*?\=\s*\[(.*?)\];", content, re.DOTALL)
    if not registry_match:
        print("FAIL: Could not find INTERNAL_KEY_EXCEPTION_REGISTRY array in TypeScript file")
        return []

    arr_content = registry_match.group(1)
    # Split by object boundaries { ... }
    object_blocks = re.findall(r"\{[^{}]*\}", arr_content, re.DOTALL)

    excps = []
    for block in object_blocks:
        excp_data = {}
        for field in REQUIRED_METADATA_FIELDS:
            m = re.search(r"" + field + r":\s*[\"']([^\"']+)[\"']", block)
            if m:
                excp_data[field] = m.group(1)
            else:
                m_arr = re.search(r"" + field + r":\s*\[(.*?)\]", block, re.DOTALL)
                if m_arr:
                    excp_data[field] = [s.strip(" \"'\n") for s in m_arr.group(1).split(",") if s.strip()]
        if excp_data.get("exceptionId"):
            excps.append(excp_data)

    return excps

def verify_exceptions():
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    print(f"=== Internal Key Exception Audit (IAM-SVC-002) ===")
    print(f"Audit Timestamp: {now_utc.isoformat()}")

    doc_ids = load_doc_exceptions(DOC_PATH)
    print(f"Documented Exceptions in Markdown ({DOC_PATH}): {doc_ids}")

    ts_excps = load_ts_registry_exceptions(REGISTRY_PATH)
    ts_ids = [e["exceptionId"] for e in ts_excps]
    print(f"Registered Exceptions in Code ({REGISTRY_PATH}): {ts_ids}")

    errors = []

    # Check 1: Documented vs Code alignment
    for doc_id in doc_ids:
        if doc_id not in ts_ids:
            errors.append(f"Exception '{doc_id}' documented in Markdown but missing in TypeScript registry!")

    for ts_id in ts_ids:
        if ts_id not in doc_ids:
            errors.append(f"Exception '{ts_id}' present in TypeScript registry but missing in Markdown documentation!")

    # Check 2: Metadata completeness
    for excp in ts_excps:
        excp_id = excp.get("exceptionId", "UNKNOWN")
        for field in REQUIRED_METADATA_FIELDS:
            val = excp.get(field)
            if not val:
                errors.append(f"Exception '{excp_id}' is missing required metadata field '{field}'!")

        # Expiration date check
        expires_at_str = excp.get("expiresAt")
        if expires_at_str:
            try:
                # Handle ISO format Z
                expires_at_dt = datetime.datetime.fromisoformat(expires_at_str.replace("Z", "+00:00"))
                if now_utc > expires_at_dt:
                    errors.append(f"Exception '{excp_id}' HAS EXPIRED on {expires_at_str}!")
                else:
                    days_remaining = (expires_at_dt - now_utc).days
                    print(f"  [PASS] {excp_id}: Active (expires in {days_remaining} days, owner: {excp.get('owner')})")
            except Exception as e:
                errors.append(f"Exception '{excp_id}' has invalid expiresAt timestamp '{expires_at_str}': {e}")

    if errors:
        print("\n--- AUDIT FAILED ---")
        for err in errors:
            print(f"  ❌ {err}")
        sys.exit(1)

    print("\n--- AUDIT PASSED ---")
    print("All production internal-key exceptions have complete metadata, valid TTLs, and documented retirement plans.")
    sys.exit(0)

if __name__ == "__main__":
    verify_exceptions()
