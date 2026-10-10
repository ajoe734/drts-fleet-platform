#!/usr/bin/env python3
"""Fail-closed read-only assessment for owned operational fixtures.

This script performs genuine guarded hosted read-only assessment for original
owned operational fixtures.
- Every report includes assessment_only=true, cleanup_not_performed=true, and no available apply operation.
"""
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import datetime
import urllib.parse
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

PROJECT = "drts-dev-devcc-20260825"
REGION = "us-central1"
BUCKET = f"{PROJECT}-document-artifacts"
EXPECTED_PRODUCT_RUN_ID = 37906298090
EXPECTED_FILE_SIZE = 327
EXPECTED_SHA256 = "4028af3714fa07d2f20e758649532faef11b4818c99a2b8dc0c88170a0dc8784"
EXPECTED_MIME = "application/pdf"
KEY_PREFIX = "fleet-partner/fleet-demo-001/supply-submissions/"

def logical_to_physical_gcs_key(logical_key: str, kind: str = "fleet-upload-content") -> str:
    encoded_subject = urllib.parse.quote(logical_key, safe="")
    return f"document-artifacts/{kind}/{encoded_subject}"

CANONICAL_OWNED_OBJECTS: Dict[str, Dict[str, str]] = {
    "fleet-partner/fleet-demo-001/supply-submissions/8b7b0b8a-bc5a-48f3-b576-af201e6ba074/18f06410-510c-4107-ae21-16ab61383b95-harmless-upload.pdf": {
        "documentId": "43e91900-b03d-4319-8bd1-25d438372f4d",
        "confirmSubmissionId": "8b7b0b8a-bc5a-48f3-b576-af201e6ba074",
        "document_type": "professional_driver_license",
    },
    "fleet-partner/fleet-demo-001/supply-submissions/8b7b0b8a-bc5a-48f3-b576-af201e6ba074/8ad02a30-c584-4deb-b2c8-5883f9a5345a-harmless-upload.pdf": {
        "documentId": "dc3aaed4-7f9c-4e61-a532-c6acd49cdf59",
        "confirmSubmissionId": "8b7b0b8a-bc5a-48f3-b576-af201e6ba074",
        "document_type": "taxi_driver_registration",
    },
    "fleet-partner/fleet-demo-001/supply-submissions/deeed4cd-ede0-4daf-a70f-4d0e900987b9/f88f9320-7c81-4df9-9abd-d7ced9c0c50a-harmless-upload.pdf": {
        "documentId": "f26201ec-7e67-4866-94fc-8a5bfd5ecbca",
        "confirmSubmissionId": "deeed4cd-ede0-4daf-a70f-4d0e900987b9",
        "document_type": "professional_driver_license",
    },
    "fleet-partner/fleet-demo-001/supply-submissions/deeed4cd-ede0-4daf-a70f-4d0e900987b9/195565d9-9f64-4a29-8446-f93bb0fe252b-harmless-upload.pdf": {
        "documentId": "9e863fbe-0ba0-4b48-b2ac-a88c8d8e8a47",
        "confirmSubmissionId": "deeed4cd-ede0-4daf-a70f-4d0e900987b9",
        "document_type": "taxi_driver_registration",
    },
    "fleet-partner/fleet-demo-001/supply-submissions/f735275c-151d-4f25-a9f0-174f2602f919/e6a71c74-a036-4ea9-a025-0386d9ed1861-harmless-upload.pdf": {
        "documentId": "4f93a852-9031-44e2-ac06-3c808c9e84cb",
        "confirmSubmissionId": "f735275c-151d-4f25-a9f0-174f2602f919",
        "document_type": "professional_driver_license",
    },
    "fleet-partner/fleet-demo-001/supply-submissions/f735275c-151d-4f25-a9f0-174f2602f919/a627cd09-ebc8-4024-88ba-91a4f5489574-harmless-upload.pdf": {
        "documentId": "d2c8b8d5-c5ac-4bd5-a5ef-94a413ac5046",
        "confirmSubmissionId": "f735275c-151d-4f25-a9f0-174f2602f919",
        "document_type": "taxi_driver_registration",
    },
    "fleet-partner/fleet-demo-001/supply-submissions/93430506-d016-4b07-897f-ab9b4d3530df/3bbb4f20-0cd5-4676-9ae1-e428ce26461b-harmless-upload.pdf": {
        "documentId": "279550a2-3eac-4c5e-b315-cb86308d9ae7",
        "confirmSubmissionId": "93430506-d016-4b07-897f-ab9b4d3530df",
        "document_type": "professional_driver_license",
    },
    "fleet-partner/fleet-demo-001/supply-submissions/93430506-d016-4b07-897f-ab9b4d3530df/024c77c7-8d95-4c29-8fd1-51dc0a89f8ba-harmless-upload.pdf": {
        "documentId": "c5e2a567-df7a-42dc-8aa6-481e5eb9e823",
        "confirmSubmissionId": "93430506-d016-4b07-897f-ab9b4d3530df",
        "document_type": "taxi_driver_registration",
    },
}

CANONICAL_OWNED_SUBMISSIONS: Tuple[str, ...] = (
    "8b7b0b8a-bc5a-48f3-b576-af201e6ba074",
    "deeed4cd-ede0-4daf-a70f-4d0e900987b9",
    "f735275c-151d-4f25-a9f0-174f2602f919",
    "93430506-d016-4b07-897f-ab9b4d3530df",
)

def require(cond: bool, msg: str):
    if not cond:
        raise ValueError(msg)

def assess_gcs_objects(runner: Callable[[str, str, str], Dict[str, Any]]) -> Dict[str, Any]:
    validated = []
    for logical_key, expected in CANONICAL_OWNED_OBJECTS.items():
        physical_key = logical_to_physical_gcs_key(logical_key)
        desc = runner("describe", BUCKET, physical_key)
        if desc.get("status") == "error":
            raise RuntimeError(f"GCS error describing gs://{BUCKET}/{physical_key}: {desc.get('stderr')}")
        if desc.get("status") == "not_found":
            raise ValueError(f"Missing object gs://{BUCKET}/{physical_key}")
        
        meta = desc.get("metadata", {})
        
        require(str(meta.get("size")) == str(EXPECTED_FILE_SIZE), f"Size mismatch for {physical_key}")
        require(meta.get("contentType") == EXPECTED_MIME, f"MIME mismatch for {physical_key}")
        require("generation" in meta, f"No generation for {physical_key}")
        require("metageneration" in meta, f"No metageneration for {physical_key}")
        
        body_res = runner("cat", BUCKET, physical_key)
        require(body_res.get("status") == "ok", f"Failed to read body for {physical_key}")
        body_bytes = body_res.get("body", b"")
        hasher = hashlib.sha256()
        hasher.update(body_bytes)
        actual_sha256 = hasher.hexdigest()
        require(actual_sha256 == EXPECTED_SHA256, f"Hash mismatch for {physical_key}")
        
        validated.append({"key": physical_key, "generation": meta["generation"]})
        
    return {"status": "success", "validated_count": len(validated)}

def assess_database(db_runner: Callable[[str, List[Any]], Dict[str, Any]]) -> Dict[str, Any]:
    q_sub = """
        SELECT count(id) FROM supply_submissions
        WHERE id = ANY(%s)
    """
    res_sub = db_runner(q_sub, [list(CANONICAL_OWNED_SUBMISSIONS)])
    require(int(res_sub["rows"][0][0]) == 4, "Missing expected supply_submissions")

    q_rev = """
        SELECT count(*) FROM supply_review_events
        WHERE submission_id = ANY(%s)
    """
    res_rev = db_runner(q_rev, [list(CANONICAL_OWNED_SUBMISSIONS)])
    
    q_aff = """
        SELECT count(*) FROM vehicle_fleet_affiliations
        WHERE source_submission_id = ANY(%s)
    """
    res_aff = db_runner(q_aff, [list(CANONICAL_OWNED_SUBMISSIONS)])
    
    return {"status": "success", "submissions_found": 4, "review_events_count": int(res_rev["rows"][0][0]), "affiliations_count": int(res_aff["rows"][0][0])}

def default_gcs_runner(action: str, bucket: str, key: str) -> Dict[str, Any]:
    if action == "describe":
        cmd = ["gcloud", "storage", "objects", "describe", f"gs://{bucket}/{key}", "--format=json", "--project", PROJECT, "--quiet"]
        res = subprocess.run(cmd, capture_output=True, text=True, check=False)
        if res.returncode == 0:
            return {"status": "ok", "metadata": json.loads(res.stdout)}
        elif "404" in res.stderr:
            return {"status": "not_found"}
        return {"status": "error", "stderr": res.stderr}
    elif action == "cat":
        cmd = ["gcloud", "storage", "cat", f"gs://{bucket}/{key}", "--project", PROJECT, "--quiet"]
        res = subprocess.run(cmd, capture_output=True, check=False)
        if res.returncode == 0:
            return {"status": "ok", "body": res.stdout}
        return {"status": "error", "stderr": res.stderr.decode('utf-8', errors='replace')}
    raise ValueError(f"Unknown action {action}")

def default_db_runner(query: str, params: List[Any]) -> Dict[str, Any]:
    script_dir = Path(__file__).resolve().parent
    root_dir = script_dir.parent.parent
    cred_helper = root_dir / "infra" / "gcp" / "dev" / "ops-drill" / "db_credentials.mjs"
    
    sec_cmd = ["gcloud", "secrets", "versions", "access", "latest", "--secret=drts-dev-db-url", "--project", PROJECT, "--quiet"]
    sec_res = subprocess.run(sec_cmd, capture_output=True, text=True, check=True)
    
    node_cmd = ["node", str(cred_helper)]
    node_res = subprocess.run(node_cmd, input=sec_res.stdout, capture_output=True, text=True, check=True)
    creds = json.loads(node_res.stdout)
    
    env = os.environ.copy()
    env["PGPASSWORD"] = creds["password"]
    env["PGHOST"] = "127.0.0.1" # Standard proxied host in dev deployments
    
    safe_uuids = [f"'{u}'" for u in params[0]]
    uuid_list = ",".join(safe_uuids)
    final_query = query.replace("%s", f"ARRAY[{uuid_list}]::uuid[]")
    
    full_sql = f"""
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
{final_query};
COMMIT;
"""
    psql_cmd = ["psql", "-U", creds["user"], "-d", creds["database"], "-t", "-A", "-c", full_sql]
    res = subprocess.run(psql_cmd, capture_output=True, text=True, env=env, check=False)
    if res.returncode != 0:
        raise RuntimeError(f"psql failed: {res.stderr}")
        
    rows = []
    for line in res.stdout.strip().split("\n"):
        if line:
            rows.append(line.split("|"))
    return {"rows": rows}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mock-db", action="store_true")
    args = parser.parse_args()
    
    report = {"assessment_only": True, "cleanup_not_performed": True, "available_apply_operation": False}
    try:
        gcs_res = assess_gcs_objects(default_gcs_runner)
        report["gcs_assessment"] = gcs_res
        
        if not args.mock_db:
            db_res = assess_database(default_db_runner)
            report["db_assessment"] = db_res
        
        print(json.dumps(report, indent=2))
        sys.exit(0)
    except Exception as e:
        report["error"] = str(e)
        print(json.dumps(report, indent=2))
        sys.exit(1)

if __name__ == "__main__":
    main()
