import argparse
import sys
import json
import hashlib
import subprocess
import os
from pathlib import Path
from typing import Dict, Any, List, Callable, Tuple

PROJECT = "drts-dev-devcc-20260825"
BUCKET = "drts-dev-devcc-20260825-fleet-uploads"

EXPECTED_SHA256 = "4028af3714fa07d2f20e758649532faef11b4818c99a2b8dc0c88170a0dc8784"
EXPECTED_FILE_SIZE = 327
EXPECTED_MIME = "application/pdf"

AUTHORIZED_PROVENANCE = {
    "run_id": "37906298090",
    "artifact_id": "11606165993",
    "zip_sha256": "2fc9ef568f7b37cf709475fd1e1bb470f1b18e55383751254cef179753b539b5",
    "workflow_sha": "9a1b6466a8b15d7d328e9ceba33ba5dc92f7fa9c"
}

def logical_to_physical_gcs_key(logical_key: str) -> str:
    encoded = logical_key.replace("/", "%2F")
    return f"document-artifacts/fleet-upload-content/{encoded}"

CANONICAL_OWNED_OBJECTS: Dict[str, Dict[str, str]] = {
    "fleet-partner/fleet-demo-001/supply-submissions/8b7b0b8a-bc5a-48f3-b576-af201e6ba074/09c3be79-e362-4dc2-b7e9-d75471d43a13-harmless-upload.pdf": {
        "documentId": "473df781-a74e-41a4-afcf-b9c647b0e14a",
        "confirmSubmissionId": "8b7b0b8a-bc5a-48f3-b576-af201e6ba074",
        "document_type": "professional_driver_license",
    },
    "fleet-partner/fleet-demo-001/supply-submissions/8b7b0b8a-bc5a-48f3-b576-af201e6ba074/3b27b38d-ec86-4fb9-a92c-fbdb9cd9e7a4-harmless-upload.pdf": {
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
    validated_meta = {}
    
    for logical_key in CANONICAL_OWNED_OBJECTS.keys():
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
        validated_meta[physical_key] = meta

    validated_reads = []
    for logical_key in CANONICAL_OWNED_OBJECTS.keys():
        physical_key = logical_to_physical_gcs_key(logical_key)
        meta = validated_meta[physical_key]
        body_res = runner("cat", BUCKET, f"{physical_key}#{meta['generation']}")
        require(body_res.get("status") == "ok", f"Failed to read body for {physical_key}")
        body_bytes = body_res.get("body", b"")
        hasher = hashlib.sha256()
        hasher.update(body_bytes)
        actual_sha256 = hasher.hexdigest()
        require(actual_sha256 == EXPECTED_SHA256, f"Hash mismatch for {physical_key}")
        
        re_desc = runner("describe", BUCKET, physical_key)
        re_meta = re_desc.get("metadata", {})
        require(re_meta.get("generation") == meta["generation"], f"Generation drift for {physical_key}")
        require(re_meta.get("metageneration") == meta["metageneration"], f"Metageneration drift for {physical_key}")
        
        validated_reads.append({
            "key": physical_key, 
            "generation": meta["generation"],
            "metageneration": meta["metageneration"]
        })
        
    return {"status": "success", "validated_count": len(validated_reads), "receipts": validated_reads}

def assess_database(db_runner: Callable[[str, List[Any]], Dict[str, Any]]) -> Dict[str, Any]:
    q_sub = "SELECT count(submission_id) FROM fleet.supply_submissions WHERE submission_id = ANY(%s)"
    res_sub = db_runner(q_sub, [list(CANONICAL_OWNED_SUBMISSIONS)])
    require(int(res_sub["rows"][0][0]) == 4, "Missing expected supply_submissions")

    q_doc = "SELECT count(document_id) FROM fleet.supply_documents WHERE submission_id = ANY(%s)"
    res_doc = db_runner(q_doc, [list(CANONICAL_OWNED_SUBMISSIONS)])
    require(int(res_doc["rows"][0][0]) == 8, "Missing expected supply_documents")

    q_rev = "SELECT count(event_id) FROM fleet.supply_review_events WHERE submission_id = ANY(%s)"
    res_rev = db_runner(q_rev, [list(CANONICAL_OWNED_SUBMISSIONS)])
    
    q_aff = "SELECT count(affiliation_id) FROM fleet.vehicle_fleet_affiliations WHERE source_submission_id = ANY(%s)"
    res_aff = db_runner(q_aff, [list(CANONICAL_OWNED_SUBMISSIONS)])
    
    q_disc = "SELECT count(vehicle_id) FROM reg.vehicle_passenger_disclosure_profiles WHERE source_submission_id = ANY(%s)"
    res_disc = db_runner(q_disc, [list(CANONICAL_OWNED_SUBMISSIONS)])

    q_cred = "SELECT count(driver_id) FROM reg.driver_public_registration_credentials WHERE source_submission_id = ANY(%s)"
    res_cred = db_runner(q_cred, [list(CANONICAL_OWNED_SUBMISSIONS)])

    count_refs = int(res_rev["rows"][0][0]) + int(res_aff["rows"][0][0]) + int(res_disc["rows"][0][0]) + int(res_cred["rows"][0][0])
    require(count_refs > 0, "Missing retention/relationship blocker: no inbound foreign keys found")

    return {
        "status": "success", 
        "submissions_found": 4,
        "documents_found": 8,
        "review_events_count": int(res_rev["rows"][0][0]), 
        "affiliations_count": int(res_aff["rows"][0][0]),
        "disclosure_count": int(res_disc["rows"][0][0]),
        "credential_count": int(res_cred["rows"][0][0]),
    }

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
    sec_res = subprocess.run(sec_cmd, capture_output=True, text=True, check=False)
    if sec_res.returncode != 0:
        raise RuntimeError("Failed to access db credentials secret")
        
    node_cmd = ["node", str(cred_helper)]
    node_res = subprocess.run(node_cmd, input=sec_res.stdout, capture_output=True, text=True, check=False)
    if node_res.returncode != 0:
        raise RuntimeError("Failed to parse db credentials")
        
    creds = json.loads(node_res.stdout)
    
    env = os.environ.copy()
    env["PGPASSWORD"] = creds["password"]
    env["PGHOST"] = "127.0.0.1"
    env["PGOPTIONS"] = "-c default_transaction_read_only=on -c default_transaction_isolation=repeatable_read -c statement_timeout=10000"
    
    safe_uuids = [f"'{u}'" for u in params[0]]
    uuid_list = ",".join(safe_uuids)
    final_query = query.replace("%s", f"ARRAY[{uuid_list}]::uuid[]")
    
    psql_cmd = ["psql", "-U", creds["user"], "-d", creds["database"], "-t", "-A", "-c", final_query]
    res = subprocess.run(psql_cmd, capture_output=True, text=True, env=env, check=False)
    if res.returncode != 0:
        raise RuntimeError(f"psql failed: {res.stderr}")
        
    rows = []
    for line in res.stdout.strip().split("\n"):
        if line:
            rows.append(line.split("|"))
    return {"rows": rows}

def verify_provenance(args) -> None:
    if args.mock_db:
        return
    require(args.product_run_id == AUTHORIZED_PROVENANCE["run_id"], "Unauthorized product_run_id")
    require(args.artifact_id == AUTHORIZED_PROVENANCE["artifact_id"], "Unauthorized artifact_id")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mock-db", action="store_true")
    parser.add_argument("--product-run-id", type=str, default="")
    parser.add_argument("--artifact-id", type=str, default="")
    args = parser.parse_args()
    
    report = {
        "assessment_only": True, 
        "cleanup_not_performed": True, 
        "available_apply_operation": False,
        "provenance": AUTHORIZED_PROVENANCE
    }
    
    try:
        if args.mock_db:
            report["disposition"] = "synthetic"
        else:
            verify_provenance(args)
            
        gcs_res = assess_gcs_objects(default_gcs_runner)
        report["gcs_assessment"] = gcs_res
        
        if args.mock_db:
            report["db_assessment"] = {"status": "skipped_due_to_mock"}
        else:
            db_res = assess_database(default_db_runner)
            report["db_assessment"] = db_res
            report["disposition"] = "complete"
            
        print(json.dumps(report, indent=2))
        if args.mock_db:
            sys.exit(1)
        sys.exit(0)
    except Exception as e:
        report["disposition"] = "error"
        report["error"] = str(e)
        print(json.dumps(report, indent=2))
        sys.exit(1)

if __name__ == "__main__":
    main()
