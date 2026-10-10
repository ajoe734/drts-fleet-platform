import argparse
import sys
import json
import hashlib
import subprocess
import os
import urllib.parse
import zipfile
import tempfile
from pathlib import Path
from typing import Dict, Any, List, Callable, Tuple

PROJECT = "drts-dev-devcc-20260825"
REGION = "us-central1"
INSTANCE = "drts-dev-db"
BUCKET = "drts-dev-devcc-20260825-document-artifacts"

EXPECTED_SHA256 = "4028af3714fa07d2f20e758649532faef11b4818c99a2b8dc0c88170a0dc8784"
EXPECTED_FILE_SIZE = 327
EXPECTED_MIME = "application/pdf"

AUTHORIZED_PROVENANCE = {
    "run_id": "37906298090",
    "artifact_id": "11606165993",
    "archive_sha256": "2fc9ef568f7b37cf709475fd1e1bb470f1b18e55383751254cef179753b539b5",
    "workflow_sha": "9a1b6466a8b15d7d328e9ceba33ba5dc92f7fa9c",
    "source_sha": "4a166f3ed2a7000061acc737ee475ae3c47dca56"
}

def logical_to_physical_gcs_key(logical_key: str) -> str:
    encoded = urllib.parse.quote(logical_key, safe="")
    return f"document-artifacts/fleet-upload-content/{encoded}"

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

def fetch_and_validate_provenance(args) -> None:
    if args.mock_db:
        return
    require(args.product_run_id == AUTHORIZED_PROVENANCE["run_id"], "Unauthorized product_run_id")
    require(args.artifact_id == AUTHORIZED_PROVENANCE["artifact_id"], "Unauthorized artifact_id")
    require(args.source_sha == AUTHORIZED_PROVENANCE["source_sha"], "Unauthorized source_sha")
    require(args.workflow_def_sha == AUTHORIZED_PROVENANCE["workflow_sha"], "Unauthorized workflow_def_sha")
    
    with tempfile.TemporaryDirectory() as td:
        zip_path = os.path.join(td, "artifact.zip")
        # Fetch using gh api
        res = subprocess.run(["gh", "api", f"/repos/ajoe734/drts-fleet-platform/actions/artifacts/{args.artifact_id}/zip"], stdout=open(zip_path, "wb"))
        if res.returncode != 0:
            raise RuntimeError("Failed to fetch artifact from GitHub API")
        
        with open(zip_path, "rb") as f:
            h = hashlib.sha256(f.read()).hexdigest()
            require(h == AUTHORIZED_PROVENANCE["archive_sha256"], f"Archive hash mismatch, got {h}")
            
        with zipfile.ZipFile(zip_path, 'r') as zf:
            evidence_data = None
            for name in zf.namelist():
                if name.endswith("operational-browser-evidence.json"):
                    evidence_data = json.loads(zf.read(name).decode("utf-8"))
            require(evidence_data is not None, "Missing operational-browser-evidence.json")
            
            raw_evidence = evidence_data.get("evidence", [])
            seen_keys = set()
            for entry in raw_evidence:
                kind = entry.get("kind")
                obj_key = entry.get("objectKey")
                if kind == "setup-document-upload" or (isinstance(obj_key, str) and obj_key.startswith("fleet-partner/fleet-demo-001/supply-submissions/")):
                    require(entry.get("candidateSha") == AUTHORIZED_PROVENANCE["source_sha"], "Evidence candidateSha mismatch")
                    require(entry.get("intentStatus") == 201, "Evidence intentStatus mismatch")
                    require(entry.get("confirmStatus") == 201, "Evidence confirmStatus mismatch")
                    require(entry.get("readbackFileSize") == EXPECTED_FILE_SIZE, "Evidence readbackFileSize mismatch")
                    require(entry.get("readbackContentType") == EXPECTED_MIME, "Evidence readbackContentType mismatch")
                    require(entry.get("readbackSha256") == EXPECTED_SHA256, "Evidence readback SHA mismatch")
                    
                    seen_keys.add(obj_key)
            
            for key in CANONICAL_OWNED_OBJECTS.keys():
                require(key in seen_keys, f"Missing canonical object in evidence: {key}")

def assess_gcs_objects(runner: Callable[[str, str, str], Dict[str, Any]]) -> Dict[str, Any]:
    validated_meta = {}
    
    for logical_key in CANONICAL_OWNED_OBJECTS.keys():
        physical_key = logical_to_physical_gcs_key(logical_key)
        desc = runner("describe", BUCKET, physical_key)
        if desc.get("status") == "error":
            raise RuntimeError(f"GCS error describing gs://{BUCKET}/{physical_key}: {desc.get('stderr')}")
        if desc.get("status") == "not_found":
            # Return proper rejection for missing instead of throwing generic ValueError
            return {"status": "rejected", "reason": f"Missing object gs://{BUCKET}/{physical_key}"}
        
        meta = desc.get("metadata", {})
        
        if str(meta.get("size")) != str(EXPECTED_FILE_SIZE):
             return {"status": "rejected", "reason": f"Size mismatch for {physical_key}"}
        if meta.get("contentType") != EXPECTED_MIME:
             return {"status": "rejected", "reason": f"MIME mismatch for {physical_key}"}
        if "generation" not in meta:
             return {"status": "rejected", "reason": f"No generation for {physical_key}"}
        if not str(meta["generation"]).isdigit():
             return {"status": "rejected", "reason": f"Non-numeric generation for {physical_key}"}
        if "metageneration" not in meta:
             return {"status": "rejected", "reason": f"No metageneration for {physical_key}"}
        if not str(meta["metageneration"]).isdigit():
             return {"status": "rejected", "reason": f"Non-numeric metageneration for {physical_key}"}
             
        time_created = meta.get("timeCreated", "")
        updated = meta.get("updated", "")
        if not time_created or not updated or "2026-10-09T" not in time_created:
             return {"status": "rejected", "reason": f"Missing or invalid time boundaries for {physical_key}"}
             
        validated_meta[physical_key] = meta

    validated_reads = []
    for logical_key in CANONICAL_OWNED_OBJECTS.keys():
        physical_key = logical_to_physical_gcs_key(logical_key)
        meta = validated_meta[physical_key]
        body_res = runner("cat", BUCKET, f"{physical_key}#{meta['generation']}")
        if body_res.get("status") != "ok":
             return {"status": "rejected", "reason": f"Failed to read body for {physical_key}: {body_res.get('stderr')}"}
             
        body_bytes = body_res.get("body", b"")
        hasher = hashlib.sha256()
        hasher.update(body_bytes)
        actual_sha256 = hasher.hexdigest()
        if actual_sha256 != EXPECTED_SHA256:
             return {"status": "rejected", "reason": f"Hash mismatch for {physical_key}"}
        
        re_desc = runner("describe", BUCKET, physical_key)
        re_meta = re_desc.get("metadata", {})
        if str(re_meta.get("generation")) != str(meta["generation"]):
             return {"status": "rejected", "reason": f"Generation drift for {physical_key}"}
        if str(re_meta.get("metageneration")) != str(meta["metageneration"]):
             return {"status": "rejected", "reason": f"Metageneration drift for {physical_key}"}
        if re_meta.get("contentType") != EXPECTED_MIME or str(re_meta.get("size")) != str(EXPECTED_FILE_SIZE):
             return {"status": "rejected", "reason": f"Identity/type/size drift for {physical_key}"}
             
        validated_reads.append({
            "key": physical_key, 
            "generation": meta["generation"],
            "metageneration": meta["metageneration"]
        })
        
    return {"status": "success", "validated_count": len(validated_reads), "receipts": validated_reads}

def assess_database(db_runner: Callable[[str, List[Any]], Dict[str, Any]]) -> Dict[str, Any]:
    safe_subs = ",".join(f"'{u}'" for u in CANONICAL_OWNED_SUBMISSIONS)
    query = f"""
    BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
    WITH subs AS (
        SELECT count(*) as c FROM fleet.supply_submissions WHERE submission_id IN ({safe_subs})
    ), docs AS (
        SELECT count(*) as c FROM fleet.supply_documents WHERE submission_id IN ({safe_subs})
    ), revs AS (
        SELECT count(*) as c FROM fleet.supply_review_events WHERE submission_id IN ({safe_subs})
    ), affs AS (
        SELECT count(*) as c FROM fleet.vehicle_fleet_affiliations WHERE source_submission_id IN ({safe_subs})
    ), discs AS (
        SELECT count(*) as c FROM reg.vehicle_passenger_disclosure_profiles WHERE source_submission_id IN ({safe_subs})
    ), creds AS (
        SELECT count(*) as c FROM reg.driver_public_registration_credentials WHERE source_submission_id IN ({safe_subs})
    )
    SELECT json_build_object(
        'subs', (SELECT c FROM subs),
        'docs', (SELECT c FROM docs),
        'revs', (SELECT c FROM revs),
        'affs', (SELECT c FROM affs),
        'discs', (SELECT c FROM discs),
        'creds', (SELECT c FROM creds)
    );
    COMMIT;
    """
    res = db_runner(query, [])
    if "error" in res:
        return {"status": "error", "error": res["error"]}
        
    try:
        counts = json.loads(res["rows"][0][0])
    except (IndexError, json.JSONDecodeError) as e:
        return {"status": "error", "error": f"Failed to parse DB results: {e}"}
        
    if counts['subs'] != 4:
        return {"status": "rejected", "reason": "Missing expected supply_submissions"}
    if counts['docs'] != 8:
        return {"status": "rejected", "reason": "Missing expected supply_documents"}
        
    count_refs = counts['revs'] + counts['affs'] + counts['discs'] + counts['creds']
    if count_refs > 0:
        return {"status": "rejected", "concrete_blocker": "Missing retention/relationship blocker: inbound foreign keys exist", "reason": "inbound foreign keys found"}
        
    return {
        "status": "success", 
        "submissions_found": counts['subs'],
        "documents_found": counts['docs'],
        "review_events_count": counts['revs'], 
        "affiliations_count": counts['affs'],
        "disclosure_count": counts['discs'],
        "credential_count": counts['creds'],
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
        return {"error": "Failed to access db credentials secret"}
        
    node_cmd = ["node", str(cred_helper)]
    node_res = subprocess.run(node_cmd, input=sec_res.stdout, capture_output=True, text=True, check=False)
    if node_res.returncode != 0:
        return {"error": "Failed to parse db credentials"}
        
    creds = json.loads(node_res.stdout)
    user = creds["user"]
    password = creds["password"]
    db = creds["database"]
    
    if any(c in password + user + db for c in "\n\r\0"):
        return {"error": "invalid_db_secret"}
        
    escape = lambda s: s.replace("\\", "\\\\").replace(":", "\\:")
    with tempfile.TemporaryDirectory() as td:
        pgpass = Path(td) / "pgpass"
        with os.fdopen(os.open(pgpass, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w") as stream:
            os.fchmod(stream.fileno(), 0o600)
            stream.write(f"127.0.0.1:*:{escape(db)}:{escape(user)}:{escape(password)}\n")
            
        env = {k: v for k, v in os.environ.items() if not k.startswith("PG")}
        env.update(PGHOST="127.0.0.1", PGUSER=user, PGDATABASE=db,
                   PGPASSFILE=str(pgpass), PGSSLMODE="disable", PGCONNECT_TIMEOUT="5",
                   PGOPTIONS="-c default_transaction_read_only=on -c default_transaction_isolation=repeatable_read -c statement_timeout=10000")
        
        proxy_path = os.environ.get("RUNNER_TEMP", "/tmp") + "/cloud-sql-proxy"
        proxy_process = None
        if os.path.exists(proxy_path):
            proxy_process = subprocess.Popen([proxy_path, "--address=127.0.0.1", "--port=5432",
                                        f"{PROJECT}:{REGION}:{INSTANCE}"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            import time
            time.sleep(3)
        else:
            return {"error": "cloud-sql-proxy not found"}
            
        try:
            sql_file = Path(td) / "query.sql"
            sql_file.write_text(query)
            
            psql_cmd = ["psql", "-X", "-q", "-A", "-t", "--no-password", "--set=ON_ERROR_STOP=1", "--file=" + str(sql_file)]
            res = subprocess.run(psql_cmd, capture_output=True, text=True, env=env, check=False)
            if res.returncode != 0:
                return {"error": f"psql failed: {res.stderr}"}
                
            rows = []
            for line in res.stdout.strip().split("\n"):
                if line:
                    rows.append(line.split("|"))
            return {"rows": rows}
        finally:
            if proxy_process and proxy_process.poll() is None:
                proxy_process.terminate()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mock-db", action="store_true")
    parser.add_argument("--product-run-id", type=str, default="")
    parser.add_argument("--artifact-id", type=str, default="")
    parser.add_argument("--source-sha", type=str, default="")
    parser.add_argument("--workflow-def-sha", type=str, default="")
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
            fetch_and_validate_provenance(args)
            
        gcs_res = assess_gcs_objects(default_gcs_runner)
        report["gcs_assessment"] = gcs_res
        
        if gcs_res.get("status") != "success":
            report["disposition"] = "rejected"
            print(json.dumps(report, indent=2))
            sys.exit(1)
        
        if args.mock_db:
            report["db_assessment"] = {"status": "skipped_due_to_mock"}
        else:
            db_res = assess_database(default_db_runner)
            report["db_assessment"] = db_res
            if db_res.get("status") != "success":
                report["disposition"] = "rejected"
                if "concrete_blocker" in db_res:
                     report["concrete_blocker"] = db_res["concrete_blocker"]
                print(json.dumps(report, indent=2))
                sys.exit(1)
            else:
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
