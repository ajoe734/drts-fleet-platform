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
    
    # Check run
    res_run = run_bounded(["gh", "api", f"/repos/ajoe734/drts-fleet-platform/actions/runs/{args.product_run_id}"], timeout_sec=30)
    require(res_run.returncode == 0, "Failed to fetch run from GitHub API")
    run_data = json.loads(res_run.stdout)
    require(str(run_data.get("id")) == args.product_run_id, "Run ID mismatch")
    require(run_data.get("head_sha") == AUTHORIZED_PROVENANCE["workflow_sha"], "Run source SHA mismatch")
    require(run_data.get("status") == "completed", "Run not completed")
    require(run_data.get("conclusion") == "success", "Run not successful")
    require(run_data.get("workflow_id") == 270139607, "Run workflow linkage mismatch")
    require(run_data.get("run_attempt") == 1, "Run attempt mismatch")
    require(run_data.get("path") == ".github/workflows/deploy-dev.yml", "Workflow path mismatch")
    
    import datetime
    start_window = datetime.datetime.fromisoformat("2026-10-09T08:39:23+00:00")
    end_window = datetime.datetime.fromisoformat("2026-10-09T09:04:10+00:00")
    try:
        run_created = datetime.datetime.fromisoformat(run_data.get("created_at", "").replace("Z", "+00:00"))
        require(start_window <= run_created <= end_window, "Run created_at out of window")
    except Exception:
        raise ValueError("Invalid run created_at")
    
    # Check jobs
    jobs = []
    page = 1
    total_count = -1
    while True:
        res_jobs = run_bounded(["gh", "api", f"/repos/ajoe734/drts-fleet-platform/actions/runs/{args.product_run_id}/jobs?per_page=100&page={page}"], timeout_sec=30)
        require(res_jobs.returncode == 0, "Failed to fetch jobs from GitHub API")
        jobs_data = json.loads(res_jobs.stdout)
        total_count = jobs_data.get("total_count", -1)
        page_jobs = jobs_data.get("jobs", [])
        if not page_jobs:
            break
        jobs.extend(page_jobs)
        if len(page_jobs) < 100:
            break
        page += 1
        
    require(total_count == 9, "Expected exactly 9 jobs total_count")
    require(len(jobs) == 9, "Expected exactly 9 jobs")
    
    expected_jobs = [
        113740473026, 113740518866, 113744327840, 113745681997,
        113746824327, 113747086904, 113747511276, 113747921500,
        113748909497
    ]
    actual_jobs = []
    
    for job in jobs:
        actual_jobs.append(job.get("id"))
        require(str(job.get("run_id")) == args.product_run_id, "Job run_id mismatch")
        require(job.get("run_url", "") == f"https://api.github.com/repos/ajoe734/drts-fleet-platform/actions/runs/{args.product_run_id}", "Job run_url mismatch")
        require(job.get("url", "") == f"https://api.github.com/repos/ajoe734/drts-fleet-platform/actions/jobs/{job.get('id')}", "Job url mismatch")
        require(job.get("html_url", "") == f"https://github.com/ajoe734/drts-fleet-platform/actions/runs/{args.product_run_id}/job/{job.get('id')}", "Job html_url mismatch")
        require(job.get("head_sha") == AUTHORIZED_PROVENANCE["workflow_sha"], "Job head_sha mismatch")
        require(job.get("status") == "completed", f"Job {job.get('id')} not completed")
        require(job.get("conclusion") in ("success", "skipped"), f"Job {job.get('id')} not successful")
        try:
            job_started = datetime.datetime.fromisoformat(job.get("started_at", "").replace("Z", "+00:00"))
            job_completed = datetime.datetime.fromisoformat(job.get("completed_at", "").replace("Z", "+00:00"))
            require(start_window <= job_started <= end_window, "Job started_at out of window")
            require(start_window <= job_completed <= end_window, "Job completed_at out of window")
            require(job_started <= job_completed, "Job chronology invalid")
        except Exception:
            raise ValueError("Invalid job times")
            
    require(actual_jobs == expected_jobs, "Exact job inventory mismatch")
    
    # Check artifacts pagination
    arts = []
    page = 1
    total_count_arts = -1
    while True:
        res_arts = run_bounded(["gh", "api", f"/repos/ajoe734/drts-fleet-platform/actions/runs/{args.product_run_id}/artifacts?per_page=100&page={page}"], timeout_sec=30)
        require(res_arts.returncode == 0, "Failed to fetch artifacts from GitHub API")
        arts_data = json.loads(res_arts.stdout)
        total_count_arts = arts_data.get("total_count", -1)
        page_arts = arts_data.get("artifacts", [])
        if not page_arts:
            break
        arts.extend(page_arts)
        if len(page_arts) < 100:
            break
        page += 1

    require(total_count_arts == len(arts), "Artifacts total_count mismatch with paginated count")

    matched_arts = []
    for a in arts:
        if str(a.get("id")) == str(args.artifact_id):
            matched_arts.append(a)
    require(len(matched_arts) == 1, "Expected exactly one artifact matching ID")
    matched_art = matched_arts[0]
    
    require(matched_art.get("url", "") == f"https://api.github.com/repos/ajoe734/drts-fleet-platform/actions/artifacts/{matched_art.get('id')}", "Artifact url mismatch")
    require(matched_art.get("archive_download_url", "") == f"https://api.github.com/repos/ajoe734/drts-fleet-platform/actions/artifacts/{matched_art.get('id')}/zip", "Artifact archive_download_url mismatch")
    require(matched_art is not None, "Artifact not associated with authoritative run")
    require(matched_art.get("name") == f"operational-browser-evidence-{AUTHORIZED_PROVENANCE['source_sha']}", "Artifact name mismatch")
    require(not matched_art.get("expired"), "Artifact expired")
    require(str(matched_art.get("workflow_run", {}).get("id")) == args.product_run_id, "Artifact run linkage mismatch")
    require(matched_art.get("workflow_run", {}).get("head_sha") == AUTHORIZED_PROVENANCE["workflow_sha"], "Artifact workflow run head_sha mismatch")
    require(matched_art.get("size_in_bytes") == 5850, "Artifact size mismatch")
    require(matched_art.get("digest") == f"sha256:{AUTHORIZED_PROVENANCE['archive_sha256']}", "Artifact digest mismatch")
    try:
        art_created = datetime.datetime.fromisoformat(matched_art.get("created_at", "").replace("Z", "+00:00"))
        require(start_window <= art_created <= end_window, "Artifact created_at out of window")
    except Exception:
        raise ValueError("Invalid artifact created_at")
    
    with tempfile.TemporaryDirectory() as td:
        zip_path = os.path.join(td, "artifact.zip")
        try:
            import time
            import select
            start_time = time.time()
            with subprocess.Popen(["gh", "api", f"/repos/ajoe734/drts-fleet-platform/actions/artifacts/{args.artifact_id}/zip"], stdout=subprocess.PIPE, stderr=subprocess.PIPE) as p:
                os.set_blocking(p.stdout.fileno(), False)
                os.set_blocking(p.stderr.fileno(), False)
                with open(zip_path, "wb") as f:
                    downloaded = 0
                    stderr_downloaded = 0
                    while True:
                        if time.time() - start_time > 30:
                            p.kill()
                            p.wait()
                            raise RuntimeError("Artifact download timeout")
                        
                        import select
                        r, _, _ = select.select([p.stdout, p.stderr], [], [], 1.0)
                        if p.stdout in r:
                            chunk = os.read(p.stdout.fileno(), 4096)
                            if chunk:
                                downloaded += len(chunk)
                                if downloaded > 10 * 1024 * 1024:
                                    p.kill()
                                    p.wait()
                                    raise RuntimeError("Artifact too large")
                                f.write(chunk)
                        if p.stderr in r:
                            chunk = os.read(p.stderr.fileno(), 4096)
                            if chunk:
                                stderr_downloaded += len(chunk)
                                if stderr_downloaded > 1 * 1024 * 1024:
                                    p.kill()
                                    p.wait()
                                    raise RuntimeError("Artifact stderr too large")
                        
                        if p.poll() is not None:
                            # Drain remaining
                            while True:
                                r2, _, _ = select.select([p.stdout, p.stderr], [], [], 0.0)
                                progress = False
                                if p.stdout in r2:
                                    chunk = os.read(p.stdout.fileno(), 4096)
                                    if chunk:
                                        downloaded += len(chunk)
                                        if downloaded > 10 * 1024 * 1024:
                                            raise RuntimeError("Artifact too large")
                                        f.write(chunk)
                                        progress = True
                                if p.stderr in r2:
                                    chunk = os.read(p.stderr.fileno(), 4096)
                                    if chunk:
                                        stderr_downloaded += len(chunk)
                                        if stderr_downloaded > 1 * 1024 * 1024:
                                            raise RuntimeError("Artifact stderr too large")
                                        progress = True
                                if not progress:
                                    break
                            break
                            
                if p.returncode != 0:
                    raise RuntimeError("Failed to fetch artifact from GitHub API")
        except Exception as e:
            raise RuntimeError(str(e))
            
        # enforce size bound on disk
        require(os.path.getsize(zip_path) == 5850, "Downloaded artifact size mismatch")
        
        with open(zip_path, "rb") as f:
            h = hashlib.sha256(f.read()).hexdigest()
            require(h == AUTHORIZED_PROVENANCE["archive_sha256"], f"Archive hash mismatch, got {h}")
            
        with zipfile.ZipFile(zip_path, 'r') as zf:
            members = zf.namelist()
            require(set(members) == {"operational-browser/report.json", "operational-browser/operational-browser-evidence.json"}, "Archive exact safe members mismatch")
            
            report_data = json.loads(zf.read("operational-browser/report.json").decode("utf-8"))
            require(report_data is not None, "Missing or invalid report.json")
            require(report_data.get("stats", {}).get("unexpected") == 0, "Report contract: unexpected != 0")
            require(report_data.get("stats", {}).get("flaky") == 0, "Report contract: flaky != 0")
            require(report_data.get("stats", {}).get("expected", 0) > 0, "Report contract: expected == 0")

            
            evidence_data = json.loads(zf.read("operational-browser/operational-browser-evidence.json").decode("utf-8"))
            require(evidence_data is not None, "Missing operational-browser-evidence.json")
            
            raw_evidence = evidence_data.get("evidence", [])
            seen_keys = []
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
                    
                    if obj_key in CANONICAL_OWNED_OBJECTS:
                        expected = CANONICAL_OWNED_OBJECTS[obj_key]
                        require(entry.get("documentId") == expected["documentId"], f"documentId mismatch for {obj_key}")
                        require(entry.get("confirmSubmissionId") == expected["confirmSubmissionId"], f"confirmSubmissionId mismatch for {obj_key}")
                        actual_type = entry.get("confirmDocumentType")
                        require(actual_type == expected["document_type"], f"documentType mismatch for {obj_key}")
                        require(entry.get("confirmFleetPartnerId") == "fleet-demo-001", f"Fleet identity mismatch for {obj_key}")
                        
                    seen_keys.append(obj_key)
            
            require(len(seen_keys) == len(CANONICAL_OWNED_OBJECTS), "Extra or duplicate target entries present")
            require(len(set(seen_keys)) == len(CANONICAL_OWNED_OBJECTS), "Duplicate target entries present")
            for key in CANONICAL_OWNED_OBJECTS.keys():
                require(key in seen_keys, f"Missing canonical object in evidence: {key}")

def assess_gcs_objects(runner: Callable[[str, str, str], Dict[str, Any]]) -> Dict[str, Any]:
    validated_meta = {}
    
    for logical_key in CANONICAL_OWNED_OBJECTS.keys():
        physical_key = logical_to_physical_gcs_key(logical_key)
        desc = runner("describe", BUCKET, physical_key)
        if desc.get("status") == "not_found":
            # Return proper rejection for missing instead of throwing generic ValueError
            return {"status": "rejected", "reason": f"Missing object gs://{BUCKET}/{physical_key}"}
        if desc.get("status") != "ok":
            raise RuntimeError(f"GCS error describing gs://{BUCKET}/{physical_key}: {desc.get('stderr', 'unknown_error')}")
        
        meta = desc.get("metadata", {})
        
        if meta.get("bucket") != BUCKET:
             return {"status": "rejected", "reason": f"Bucket mismatch for {physical_key}"}
        if meta.get("name") != physical_key:
             return {"status": "rejected", "reason": f"Object name mismatch for {physical_key}"}
             
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
        stored_at = meta.get("metadata", {}).get("stored-at", "")
        if not stored_at:
             return {"status": "rejected", "reason": f"Missing stored-at for {physical_key}"}
             
        import datetime
        try:
            tc = datetime.datetime.fromisoformat(time_created.replace("Z", "+00:00"))
            up = datetime.datetime.fromisoformat(updated.replace("Z", "+00:00"))
            sa = datetime.datetime.fromisoformat(stored_at.replace("Z", "+00:00"))
            start = datetime.datetime.fromisoformat("2026-10-09T08:39:23+00:00")
            end = datetime.datetime.fromisoformat("2026-10-09T09:04:10+00:00")
            if not (start <= tc <= end) or not (start <= up <= end) or not (start <= sa <= end):
                return {"status": "rejected", "reason": f"Timestamps outside allowed window for {physical_key}"}
        except Exception:
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
        if re_desc.get("status") != "ok":
             return {"status": "rejected", "reason": f"Failed to describe on recheck for {physical_key}"}
        re_meta = re_desc.get("metadata", {})
        if re_meta.get("bucket") != BUCKET:
             return {"status": "rejected", "reason": f"Bucket mismatch on recheck for {physical_key}"}
        if re_meta.get("name") != physical_key:
             return {"status": "rejected", "reason": f"Object name mismatch on recheck for {physical_key}"}
        if str(re_meta.get("generation")) != str(meta["generation"]):
             return {"status": "rejected", "reason": f"Generation drift for {physical_key}"}
        if str(re_meta.get("metageneration")) != str(meta["metageneration"]):
             return {"status": "rejected", "reason": f"Metageneration drift for {physical_key}"}
        if re_meta.get("contentType") != EXPECTED_MIME or str(re_meta.get("size")) != str(EXPECTED_FILE_SIZE):
             return {"status": "rejected", "reason": f"Identity/type/size drift for {physical_key}"}
        if re_meta.get("timeCreated") != meta.get("timeCreated") or re_meta.get("updated") != meta.get("updated"):
             return {"status": "rejected", "reason": f"Timestamp drift for {physical_key}"}
        if re_meta.get("metadata", {}).get("stored-at") != meta.get("metadata", {}).get("stored-at"):
             return {"status": "rejected", "reason": f"Stored-at drift for {physical_key}"}
             
        validated_reads.append({
            "bucket": BUCKET,
            "logical_key": logical_key,
            "key": physical_key, 
            "generation": meta["generation"],
            "metageneration": meta["metageneration"],
            "size": meta["size"],
            "contentType": meta["contentType"],
            "timeCreated": meta["timeCreated"],
            "updated": meta["updated"],
            "stored-at": meta.get("metadata", {}).get("stored-at"),
            "hash": EXPECTED_SHA256,
            "documentId": CANONICAL_OWNED_OBJECTS[logical_key]["documentId"],
            "confirmSubmissionId": CANONICAL_OWNED_OBJECTS[logical_key]["confirmSubmissionId"]
        })
        
    return {"status": "success", "validated_count": len(validated_reads), "receipts": validated_reads}

def assess_database(db_runner: Callable[[str, List[Any]], Dict[str, Any]]) -> Dict[str, Any]:
    safe_subs = ",".join(f"'{u}'" for u in CANONICAL_OWNED_SUBMISSIONS)
    query = f"""
    BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
    WITH subs AS (
        SELECT COALESCE(json_agg(s.*), '[]'::json) as data FROM fleet.supply_submissions s WHERE submission_id IN ({safe_subs})
    ), docs AS (
        SELECT COALESCE(json_agg(d.*), '[]'::json) as data FROM fleet.supply_documents d WHERE submission_id IN ({safe_subs})
    ), revs AS (
        SELECT count(*) as c FROM fleet.supply_review_events WHERE submission_id IN ({safe_subs})
    ), affs AS (
        SELECT count(*) as c FROM fleet.vehicle_fleet_affiliations WHERE source_submission_id IN ({safe_subs})
    ), discs AS (
        SELECT count(*) as c FROM reg.vehicle_passenger_disclosure_profiles WHERE source_submission_id IN ({safe_subs})
    ), creds AS (
        SELECT count(*) as c FROM reg.driver_public_registration_credentials WHERE source_submission_id IN ({safe_subs})
    ), cdriv AS (
        SELECT count(*) as c FROM reg.phase1_registry_drivers WHERE driver_id IN (SELECT canonical_driver_id FROM fleet.supply_submissions WHERE submission_id IN ({safe_subs}) AND canonical_driver_id IS NOT NULL)
    ), cveh AS (
        SELECT count(*) as c FROM reg.phase1_registry_vehicles WHERE vehicle_id IN (SELECT canonical_vehicle_id FROM fleet.supply_submissions WHERE submission_id IN ({safe_subs}) AND canonical_vehicle_id IS NOT NULL)
    ), cpol AS (
        SELECT count(*) as c FROM reg.phase1_registry_policies WHERE policy_id IN (SELECT canonical_policy_id FROM fleet.supply_submissions WHERE submission_id IN ({safe_subs}) AND canonical_policy_id IS NOT NULL)
    ), ccont AS (
        SELECT count(*) as c FROM reg.phase1_registry_contracts WHERE contract_id IN (SELECT canonical_contract_id FROM fleet.supply_submissions WHERE submission_id IN ({safe_subs}) AND canonical_contract_id IS NOT NULL)
    ), ddrafts AS (
        SELECT count(*) as c FROM fleet.driver_supply_drafts WHERE preferred_vehicle_submission_id IN ({safe_subs}) OR submission_id IN ({safe_subs})
    ), vdrafts AS (
        SELECT count(*) as c FROM fleet.vehicle_supply_drafts WHERE current_driver_submission_id IN ({safe_subs}) OR submission_id IN ({safe_subs})    ), cpairs AS (
        SELECT count(*) as c FROM reg.phase1_registry_supply_pairs WHERE vehicle_id IN (SELECT canonical_vehicle_id FROM fleet.supply_submissions WHERE submission_id IN ({safe_subs}) AND canonical_vehicle_id IS NOT NULL) OR driver_id IN (SELECT canonical_driver_id FROM fleet.supply_submissions WHERE submission_id IN ({safe_subs}) AND canonical_driver_id IS NOT NULL)
    ), cexcl AS (
        SELECT count(*) as c FROM reg.phase1_registry_exclusivities WHERE vehicle_id IN (SELECT canonical_vehicle_id FROM fleet.supply_submissions WHERE submission_id IN ({safe_subs}) AND canonical_vehicle_id IS NOT NULL)
    ), audits AS (
        SELECT count(*) as c FROM admin.audit_logs WHERE resource_id IN ({safe_subs})
    ), fks_meta AS (
        SELECT json_agg(json_build_object('rel', conrelid::regclass, 'confrel', confrelid::regclass, 'name', conname, 'contype', contype, 'confdeltype', confdeltype, 'confupdtype', confupdtype, 'def', pg_get_constraintdef(oid))) as data 
        FROM pg_constraint WHERE confrelid IN ('fleet.supply_submissions'::regclass, 'fleet.supply_documents'::regclass, 'fleet.supply_review_events'::regclass, 'fleet.vehicle_fleet_affiliations'::regclass, 'reg.vehicle_passenger_disclosure_profiles'::regclass, 'reg.driver_public_registration_credentials'::regclass, 'reg.phase1_registry_drivers'::regclass, 'reg.phase1_registry_vehicles'::regclass, 'reg.phase1_registry_policies'::regclass, 'reg.phase1_registry_contracts'::regclass, 'fleet.driver_supply_drafts'::regclass, 'fleet.vehicle_supply_drafts'::regclass, 'reg.phase1_registry_supply_pairs'::regclass, 'reg.phase1_registry_exclusivities'::regclass, 'admin.audit_logs'::regclass)
    ), pres_subs AS (SELECT json_build_object('c', (SELECT count(*) FROM fleet.supply_submissions), 'digest', md5(COALESCE(string_agg(md5(t::text), ''), ''))) as data FROM (SELECT * FROM fleet.supply_submissions ORDER BY 1) t),
    pres_docs AS (SELECT json_build_object('c', (SELECT count(*) FROM fleet.supply_documents), 'digest', md5(COALESCE(string_agg(md5(t::text), ''), ''))) as data FROM (SELECT * FROM fleet.supply_documents ORDER BY 1) t),
    pres_revs AS (SELECT json_build_object('c', (SELECT count(*) FROM fleet.supply_review_events), 'digest', md5(COALESCE(string_agg(md5(t::text), ''), ''))) as data FROM (SELECT * FROM fleet.supply_review_events ORDER BY 1) t),
    pres_affs AS (SELECT json_build_object('c', (SELECT count(*) FROM fleet.vehicle_fleet_affiliations), 'digest', md5(COALESCE(string_agg(md5(t::text), ''), ''))) as data FROM (SELECT * FROM fleet.vehicle_fleet_affiliations ORDER BY 1) t),
    pres_discs AS (SELECT json_build_object('c', (SELECT count(*) FROM reg.vehicle_passenger_disclosure_profiles), 'digest', md5(COALESCE(string_agg(md5(t::text), ''), ''))) as data FROM (SELECT * FROM reg.vehicle_passenger_disclosure_profiles ORDER BY 1) t),
    pres_creds AS (SELECT json_build_object('c', (SELECT count(*) FROM reg.driver_public_registration_credentials), 'digest', md5(COALESCE(string_agg(md5(t::text), ''), ''))) as data FROM (SELECT * FROM reg.driver_public_registration_credentials ORDER BY 1) t),
    pres_cdriv AS (SELECT json_build_object('c', (SELECT count(*) FROM reg.phase1_registry_drivers), 'digest', md5(COALESCE(string_agg(md5(t::text), ''), ''))) as data FROM (SELECT * FROM reg.phase1_registry_drivers ORDER BY 1) t),
    pres_cveh AS (SELECT json_build_object('c', (SELECT count(*) FROM reg.phase1_registry_vehicles), 'digest', md5(COALESCE(string_agg(md5(t::text), ''), ''))) as data FROM (SELECT * FROM reg.phase1_registry_vehicles ORDER BY 1) t),
    pres_cpol AS (SELECT json_build_object('c', (SELECT count(*) FROM reg.phase1_registry_policies), 'digest', md5(COALESCE(string_agg(md5(t::text), ''), ''))) as data FROM (SELECT * FROM reg.phase1_registry_policies ORDER BY 1) t),
    pres_ccont AS (SELECT json_build_object('c', (SELECT count(*) FROM reg.phase1_registry_contracts), 'digest', md5(COALESCE(string_agg(md5(t::text), ''), ''))) as data FROM (SELECT * FROM reg.phase1_registry_contracts ORDER BY 1) t),
    pres_ddrafts AS (SELECT json_build_object('c', (SELECT count(*) FROM fleet.driver_supply_drafts), 'digest', md5(COALESCE(string_agg(md5(t::text), ''), ''))) as data FROM (SELECT * FROM fleet.driver_supply_drafts ORDER BY 1) t),
    pres_vdrafts AS (SELECT json_build_object('c', (SELECT count(*) FROM fleet.vehicle_supply_drafts), 'digest', md5(COALESCE(string_agg(md5(t::text), ''), ''))) as data FROM (SELECT * FROM fleet.vehicle_supply_drafts ORDER BY 1) t),
    pres_cpairs AS (SELECT json_build_object('c', (SELECT count(*) FROM reg.phase1_registry_supply_pairs), 'digest', md5(COALESCE(string_agg(md5(t::text), ''), ''))) as data FROM (SELECT * FROM reg.phase1_registry_supply_pairs ORDER BY 1) t),
    pres_cexcl AS (SELECT json_build_object('c', (SELECT count(*) FROM reg.phase1_registry_exclusivities), 'digest', md5(COALESCE(string_agg(md5(t::text), ''), ''))) as data FROM (SELECT * FROM reg.phase1_registry_exclusivities ORDER BY 1) t),
    pres_audits AS (SELECT json_build_object('c', (SELECT count(*) FROM admin.audit_logs), 'digest', md5(COALESCE(string_agg(md5(t::text), ''), ''))) as data FROM (SELECT * FROM admin.audit_logs ORDER BY 1) t)
    SELECT json_build_object(
        'subs', (SELECT data FROM subs),
        'docs', (SELECT data FROM docs),
        'revs', (SELECT c FROM revs),
        'affs', (SELECT c FROM affs),
        'discs', (SELECT c FROM discs),
        'creds', (SELECT c FROM creds),
        'cdriv', (SELECT c FROM cdriv),
        'cveh', (SELECT c FROM cveh),
        'cpol', (SELECT c FROM cpol),
        'ccont', (SELECT c FROM ccont),
        'ddrafts', (SELECT c FROM ddrafts),
        'vdrafts', (SELECT c FROM vdrafts),
        'cpairs', (SELECT c FROM cpairs),
        'cexcl', (SELECT c FROM cexcl),
        'audits', (SELECT c FROM audits),
        'fks_meta', (SELECT data FROM fks_meta),
        'pres_subs', (SELECT data FROM pres_subs),
        'pres_docs', (SELECT data FROM pres_docs),
        'pres_revs', (SELECT data FROM pres_revs),
        'pres_affs', (SELECT data FROM pres_affs),
        'pres_discs', (SELECT data FROM pres_discs),
        'pres_creds', (SELECT data FROM pres_creds),
        'pres_cdriv', (SELECT data FROM pres_cdriv),
        'pres_cveh', (SELECT data FROM pres_cveh),
        'pres_cpol', (SELECT data FROM pres_cpol),
        'pres_ccont', (SELECT data FROM pres_ccont),
        'pres_ddrafts', (SELECT data FROM pres_ddrafts),
        'pres_vdrafts', (SELECT data FROM pres_vdrafts),
        'pres_cpairs', (SELECT data FROM pres_cpairs),
        'pres_cexcl', (SELECT data FROM pres_cexcl),
        'pres_audits', (SELECT data FROM pres_audits),
        'tx_ro', current_setting('transaction_read_only'),
        'tx_iso', current_setting('transaction_isolation')
    );
    COMMIT;
    """
    res = db_runner(query, [])
    if "error" in res or res.get("status") == "error":
        return {"status": "error", "error": res.get("error", "Unknown DB runner error")}
        
    try:
        counts = json.loads(res["rows"][0][0])
    except (IndexError, json.JSONDecodeError, TypeError, KeyError) as e:
        return {"status": "error", "error": f"Failed to parse DB results: {e}"}
        
    if counts.get('tx_ro') != 'on' or counts.get('tx_iso') != 'repeatable read':
        return {"status": "rejected", "reason": "Transaction mode not verified"}
        
    for k in ['revs', 'affs', 'discs', 'creds', 'cdriv', 'cveh', 'cpol', 'ccont', 'ddrafts', 'vdrafts', 'cpairs', 'cexcl', 'audits']:
        if counts.get(k) is None:
            return {"status": "error", "error": f"Missing count for {k}"}
        if type(counts.get(k)) is not int:
             return {"status": "error", "error": f"Non-integer count for {k}"}
        if counts.get(k, 0) < 0:
            return {"status": "rejected", "reason": f"Negative reference counts for {k}"}
    for k in ['pres_subs', 'pres_docs', 'pres_revs', 'pres_affs', 'pres_discs', 'pres_creds', 'pres_cdriv', 'pres_cveh', 'pres_cpol', 'pres_ccont', 'pres_ddrafts', 'pres_vdrafts', 'pres_cpairs', 'pres_cexcl', 'pres_audits']:
        obj = counts.get(k)
        if obj is None or type(obj) is not dict or 'c' not in obj or 'digest' not in obj:
            return {"status": "error", "error": f"Missing or invalid preservation inventory for {k}"}
        if type(obj['c']) is not int or obj['c'] < 0:
            return {"status": "error", "error": f"Invalid preservation count for {k}"}
        if not obj['digest'] or len(obj['digest']) != 32 or not all(c in '0123456789abcdef' for c in obj['digest']):
            return {"status": "error", "error": f"Invalid preservation digest for {k}"}
            
    if counts['pres_subs']['c'] < 4:
        return {"status": "rejected", "reason": "Preservation subs count less than expected 4"}
    if counts['pres_docs']['c'] < 8:
        return {"status": "rejected", "reason": "Preservation docs count less than expected 8"}
            
    fks_meta = counts.get('fks_meta', [])
    if not fks_meta or len(fks_meta) == 0:
        return {"status": "rejected", "reason": "No incoming foreign keys detected"}
    
    expected_fks = {
        ('fleet.supply_documents', 'fleet.supply_submissions'): ('supply_documents_submission_id_fkey', 'FOREIGN KEY (submission_id) REFERENCES fleet.supply_submissions(submission_id) ON DELETE CASCADE', 'c'),
        ('fleet.supply_review_events', 'fleet.supply_submissions'): ('supply_review_events_submission_id_fkey', 'FOREIGN KEY (submission_id) REFERENCES fleet.supply_submissions(submission_id)', 'a'),
        ('fleet.vehicle_fleet_affiliations', 'fleet.supply_submissions'): ('vehicle_fleet_affiliations_source_submission_id_fkey', 'FOREIGN KEY (source_submission_id) REFERENCES fleet.supply_submissions(submission_id)', 'a'),
        ('fleet.driver_supply_drafts', 'fleet.supply_submissions'): ('driver_supply_drafts_submission_id_fkey', 'FOREIGN KEY (submission_id) REFERENCES fleet.supply_submissions(submission_id) ON DELETE CASCADE', 'c'),
        ('fleet.vehicle_supply_drafts', 'fleet.supply_submissions'): ('vehicle_supply_drafts_submission_id_fkey', 'FOREIGN KEY (submission_id) REFERENCES fleet.supply_submissions(submission_id) ON DELETE CASCADE', 'c'),
    }
    
    if len(fks_meta) != len(expected_fks):
        return {"status": "rejected", "reason": "Duplicate or missing foreign keys"}
    
    seen_fks = set()
    for fk in fks_meta:
        if fk.get('contype') != 'f':
            return {"status": "rejected", "reason": f"Foreign key {fk.get('name')} has invalid contype"}
        rel = fk.get('rel')
        confrel = fk.get('confrel')
        deltype = fk.get('confdeltype')
        updtype = fk.get('confupdtype')
        if (rel, confrel) in expected_fks:
            expected_name, expected_def, expected_deltype = expected_fks[(rel, confrel)]
            if fk.get('name') != expected_name:
                return {"status": "rejected", "reason": f"Foreign key {fk.get('name')} wrong name, expected {expected_name}"}
            if fk.get('def') != expected_def:
                return {"status": "rejected", "reason": f"Foreign key {fk.get('name')} wrong def"}
            if deltype != expected_deltype:
                return {"status": "rejected", "reason": f"Foreign key {fk.get('name')} has wrong confdeltype"}
            if updtype != 'a':
                return {"status": "rejected", "reason": f"Foreign key {fk.get('name')} has wrong confupdtype"}
            seen_fks.add((rel, confrel))
        else:
            return {"status": "rejected", "reason": f"Unexpected foreign key {fk.get('name')} from {rel} to {confrel}"}
            
    if seen_fks != set(expected_fks.keys()):
        return {"status": "rejected", "reason": "Missing expected foreign key relationships"}
        
    subs = counts.get('subs', [])
    docs = counts.get('docs', [])
    
    if len(subs) != 4:
        return {"status": "rejected", "reason": "Missing expected supply_submissions"}
    if len(docs) != 8:
        return {"status": "rejected", "reason": "Missing expected supply_documents"}
        
    seen_subs = set()
    for s in subs:
        if s.get("status") not in ("draft", "submitted", "in_review", "needs_revision", "approved", "rejected", "withdrawn"):
            return {"status": "rejected", "reason": "Submission has arbitrary/error status"}
        if s.get("fleet_partner_id") != "fleet-demo-001":
            return {"status": "rejected", "reason": "Submission has foreign fleet partner"}
        if "revision_no" not in s or "created_at" not in s or s.get("revision_no") is None:
            return {"status": "rejected", "reason": "Submission missing revision_no/created_at"}
        if int(s.get("revision_no", -1)) < 0:
            return {"status": "rejected", "reason": "Negative revision_no"}
        sub_id = s.get("submission_id") or s.get("id")
        if sub_id not in CANONICAL_OWNED_SUBMISSIONS:
            return {"status": "rejected", "reason": "Submission has unowned submission_id"}
        if not s.get("created_at"):
            return {"status": "rejected", "reason": "Submission missing valid created_at"}
        
        # F4/F5: Missing canonical/draft/audit relationships. "canonical_driver_id with otherwise zero inventory counts returns success".
        # Ensure we actually check if it has a canonical driver ID, it should be in the canonical tables!
        if s.get("canonical_driver_id") and counts.get('cdriv') == 0:
             return {"status": "rejected", "reason": "Has canonical_driver_id but no cdriv rows"}
        if s.get("canonical_vehicle_id") and counts.get('cveh') == 0:
             return {"status": "rejected", "reason": "Has canonical_vehicle_id but no cveh rows"}
        if s.get("canonical_policy_id") and counts.get('cpol') == 0:
             return {"status": "rejected", "reason": "Has canonical_policy_id but no cpol rows"}
        if s.get("canonical_contract_id") and counts.get('ccont') == 0:
             return {"status": "rejected", "reason": "Has canonical_contract_id but no ccont rows"}
        
        import datetime
        try:
            ca = datetime.datetime.fromisoformat(s.get("created_at").replace("Z", "+00:00"))
            start = datetime.datetime.fromisoformat("2026-10-09T08:39:23+00:00")
            end = datetime.datetime.fromisoformat("2026-10-09T09:04:10+00:00")
            if not (start <= ca <= end):
                return {"status": "rejected", "reason": f"Submission {sub_id} created_at out of window"}
        except Exception:
            return {"status": "rejected", "reason": f"Submission {sub_id} invalid created_at"}
        seen_subs.add(sub_id)
        
    if seen_subs != set(CANONICAL_OWNED_SUBMISSIONS):
        return {"status": "rejected", "reason": "Exact unique submission set mismatch"}
            
    for logical_key, expected in CANONICAL_OWNED_OBJECTS.items():
        doc_id = expected["documentId"]
        matched_doc = next((d for d in docs if (d.get("document_id") or d.get("id") or d.get("documentId")) == doc_id), None)
        if not matched_doc:
            return {"status": "rejected", "reason": f"Missing document {doc_id}"}
        if matched_doc.get("submission_id") != expected["confirmSubmissionId"]:
            return {"status": "rejected", "reason": f"Document {doc_id} wrong submission_id"}
        if matched_doc.get("fleet_partner_id") != "fleet-demo-001":
            return {"status": "rejected", "reason": f"Document {doc_id} wrong fleet_partner_id"}
        if matched_doc.get("file_object_key") != logical_key:
            return {"status": "rejected", "reason": f"Document {doc_id} wrong file_object_key"}
        if matched_doc.get("checksum_sha256") != EXPECTED_SHA256:
            return {"status": "rejected", "reason": f"Document {doc_id} wrong checksum_sha256"}
        if matched_doc.get("document_type") != expected["document_type"]:
            return {"status": "rejected", "reason": f"Document {doc_id} wrong document_type"}
        
        # F4/F5 says: "null document NOT NULL size/MIME returns success... skip missing/null fields". We must require them.
        if matched_doc.get("file_size") is None or matched_doc.get("file_size") != EXPECTED_FILE_SIZE:
            return {"status": "rejected", "reason": f"Document {doc_id} missing or wrong file_size"}
        if matched_doc.get("content_type") is None or matched_doc.get("content_type") != EXPECTED_MIME:
            return {"status": "rejected", "reason": f"Document {doc_id} missing or wrong content_type"}
            
        uploaded = matched_doc.get("uploaded_at")
        if not uploaded:
            return {"status": "rejected", "reason": f"Document {doc_id} missing uploaded_at"}
        
        import datetime
        try:
            up = datetime.datetime.fromisoformat(uploaded.replace("Z", "+00:00"))
            start = datetime.datetime.fromisoformat("2026-10-09T08:39:23+00:00")
            end = datetime.datetime.fromisoformat("2026-10-09T09:04:10+00:00")
            if not (start <= up <= end):
                return {"status": "rejected", "reason": f"Document {doc_id} uploaded_at out of window"}
        except Exception:
            return {"status": "rejected", "reason": f"Document {doc_id} invalid uploaded_at"}
            
    if counts.get('revs', 0) > 0:
        return {"status": "rejected", "concrete_blocker": f"Missing retention/relationship blocker: {counts['revs']} review_events exist", "reason": "review_events found"}
    if counts.get('affs', 0) > 0:
        return {"status": "rejected", "concrete_blocker": f"Missing retention/relationship blocker: {counts['affs']} vehicle_fleet_affiliations exist", "reason": "vehicle_fleet_affiliations found"}
    if counts.get('discs', 0) > 0:
        return {"status": "rejected", "concrete_blocker": f"Missing retention/relationship blocker: {counts['discs']} disclosure_profiles exist", "reason": "disclosure_profiles found"}
    if counts.get('creds', 0) > 0:
        return {"status": "rejected", "concrete_blocker": f"Missing retention/relationship blocker: {counts['creds']} credentials exist", "reason": "credentials found"}
    if counts.get('cdriv', 0) > 0:
        return {"status": "rejected", "concrete_blocker": f"Missing retention/relationship blocker: {counts['cdriv']} phase1_registry_drivers exist", "reason": "phase1_registry_drivers found"}
    if counts.get('cveh', 0) > 0:
        return {"status": "rejected", "concrete_blocker": f"Missing retention/relationship blocker: {counts['cveh']} phase1_registry_vehicles exist", "reason": "phase1_registry_vehicles found"}
    if counts.get('cpol', 0) > 0:
        return {"status": "rejected", "concrete_blocker": f"Missing retention/relationship blocker: {counts['cpol']} phase1_registry_policies exist", "reason": "phase1_registry_policies found"}
    if counts.get('ccont', 0) > 0:
        return {"status": "rejected", "concrete_blocker": f"Missing retention/relationship blocker: {counts['ccont']} phase1_registry_contracts exist", "reason": "phase1_registry_contracts found"}
    if counts.get('ddrafts', 0) > 0:
        return {"status": "rejected", "concrete_blocker": f"Missing retention/relationship blocker: {counts['ddrafts']} driver_supply_drafts exist", "reason": "driver_supply_drafts found"}
    if counts.get('vdrafts', 0) > 0:
        return {"status": "rejected", "concrete_blocker": f"Missing retention/relationship blocker: {counts['vdrafts']} vehicle_supply_drafts exist", "reason": "vehicle_supply_drafts found"}
        

    if counts.get('cpairs', 0) > 0:
        return {"status": "rejected", "concrete_blocker": f"Missing retention/relationship blocker: {counts['cpairs']} phase1_registry_supply_pairs exist", "reason": "phase1_registry_supply_pairs found"}
    if counts.get('cexcl', 0) > 0:
        return {"status": "rejected", "concrete_blocker": f"Missing retention/relationship blocker: {counts['cexcl']} phase1_registry_exclusivities exist", "reason": "phase1_registry_exclusivities found"}
    if counts.get('audits', 0) > 0:
        return {"status": "rejected", "concrete_blocker": f"Missing retention/relationship blocker: {counts['audits']} audit_logs exist", "reason": "audit_logs found"}
        
    return {
        "status": "success", 
        "submissions_found": len(subs),
        "documents_found": len(docs),
        "review_events_count": counts.get('revs', 0), 
        "affiliations_count": counts.get('affs', 0),
        "disclosure_count": counts.get('discs', 0),
        "credential_count": counts.get('creds', 0),
        "preservation_inventory": {
            "incoming_fks": [{"name": f.get("name"), "rel": f.get("rel"), "confrel": f.get("confrel"), "contype": f.get("contype"), "confdeltype": f.get("confdeltype"), "confupdtype": f.get("confupdtype"), "def": f.get("def")} for f in fks_meta],
            "submissions": {"c": counts.get('pres_subs', {}).get('c'), "digest": counts.get('pres_subs', {}).get('digest')},
            "documents": {"c": counts.get('pres_docs', {}).get('c'), "digest": counts.get('pres_docs', {}).get('digest')},
            "review_events": {"c": counts.get('pres_revs', {}).get('c'), "digest": counts.get('pres_revs', {}).get('digest')},
            "affiliations": {"c": counts.get('pres_affs', {}).get('c'), "digest": counts.get('pres_affs', {}).get('digest')},
            "disclosures": {"c": counts.get('pres_discs', {}).get('c'), "digest": counts.get('pres_discs', {}).get('digest')},
            "credentials": {"c": counts.get('pres_creds', {}).get('c'), "digest": counts.get('pres_creds', {}).get('digest')},
            "drivers": {"c": counts.get('pres_cdriv', {}).get('c'), "digest": counts.get('pres_cdriv', {}).get('digest')},
            "vehicles": {"c": counts.get('pres_cveh', {}).get('c'), "digest": counts.get('pres_cveh', {}).get('digest')},
            "policies": {"c": counts.get('pres_cpol', {}).get('c'), "digest": counts.get('pres_cpol', {}).get('digest')},
            "contracts": {"c": counts.get('pres_ccont', {}).get('c'), "digest": counts.get('pres_ccont', {}).get('digest')},
            "driver_drafts": {"c": counts.get('pres_ddrafts', {}).get('c'), "digest": counts.get('pres_ddrafts', {}).get('digest')},
            "vehicle_drafts": {"c": counts.get('pres_vdrafts', {}).get('c'), "digest": counts.get('pres_vdrafts', {}).get('digest')},
            "supply_pairs": {"c": counts.get('pres_cpairs', {}).get('c'), "digest": counts.get('pres_cpairs', {}).get('digest')},
            "exclusivities": {"c": counts.get('pres_cexcl', {}).get('c'), "digest": counts.get('pres_cexcl', {}).get('digest')},
            "audits": {"c": counts.get('pres_audits', {}).get('c'), "digest": counts.get('pres_audits', {}).get('digest')}
        }
    }

def default_gcs_runner(action: str, bucket: str, key: str) -> Dict[str, Any]:
    if action == "describe":
        cmd = ["gcloud", "storage", "objects", "describe", f"gs://{bucket}/{key}", "--format=json", "--project", PROJECT, "--quiet"]
        try:
            res = run_bounded(cmd, timeout_sec=30)
        except Exception:
            return {"status": "error", "stderr": "describe timeout"}
        if res.returncode == 0:
            try:
                return {"status": "ok", "metadata": json.loads(res.stdout)}
            except json.JSONDecodeError:
                return {"status": "error", "stderr": "Invalid JSON"}
        elif "404" in res.stderr and "No such object" in res.stderr and "Bucket not found" not in res.stderr:
            return {"status": "not_found"}
        else:
            return {"status": "error", "stderr": "gcloud describe failed"}
    elif action == "cat":
        cmd = ["gcloud", "storage", "cat", f"gs://{bucket}/{key}", "--project", PROJECT, "--quiet"]
        try:
            import time
            import select
            start_time = time.time()
            with subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE) as p:
                body = b""
                stderr_data = b""
                os.set_blocking(p.stdout.fileno(), False)
                os.set_blocking(p.stderr.fileno(), False)
                
                # Read stdout and stderr incrementally
                while True:
                    if time.time() - start_time > 30:
                        p.kill()
                        p.wait()
                        return {"status": "error", "stderr": "cat timeout"}
                        
                    import select
                    r, _, _ = select.select([p.stdout, p.stderr], [], [], 1.0)
                    
                    if p.stdout in r:
                        chunk = os.read(p.stdout.fileno(), 4096)
                        if chunk:
                            body += chunk
                            if len(body) > 10 * 1024 * 1024:
                                p.kill()
                                p.wait()
                                return {"status": "error", "stderr": "File too large"}
                                
                    if p.stderr in r:
                        chunk = os.read(p.stderr.fileno(), 4096)
                        if chunk:
                            stderr_data += chunk
                            if len(stderr_data) > 1 * 1024 * 1024:
                                p.kill()
                                p.wait()
                                return {"status": "error", "stderr": "Stderr too large"}
                                
                    if p.poll() is not None:
                        # Drain remaining
                        while True:
                            r2, _, _ = select.select([p.stdout, p.stderr], [], [], 0.0)
                            progress = False
                            if p.stdout in r2:
                                chunk = os.read(p.stdout.fileno(), 4096)
                                if chunk:
                                    body += chunk
                                    if len(body) > 10 * 1024 * 1024:
                                        return {"status": "error", "stderr": "File too large"}
                                    progress = True
                            if p.stderr in r2:
                                chunk = os.read(p.stderr.fileno(), 4096)
                                if chunk:
                                    stderr_data += chunk
                                    if len(stderr_data) > 1 * 1024 * 1024:
                                        return {"status": "error", "stderr": "Stderr too large"}
                                    progress = True
                            if not progress:
                                break
                        break
                        
                if p.returncode == 0:
                    return {"status": "ok", "body": body}
                return {"status": "error", "stderr": "gcloud cat failed"}
        except Exception as e:
            return {"status": "error", "stderr": "cat execution error"}
    raise ValueError(f"Unknown action {action}")

def default_db_runner(query: str, params: List[Any]) -> Dict[str, Any]:
    script_dir = Path(__file__).resolve().parent
    root_dir = script_dir.parent.parent
    cred_helper = root_dir / "infra" / "gcp" / "dev" / "ops-drill" / "db_credentials.mjs"
    
    sec_cmd = ["gcloud", "secrets", "versions", "access", "latest", "--secret=drts-dev-db-url", "--project", PROJECT, "--quiet"]
    try:
        sec_res = run_bounded(sec_cmd, timeout_sec=10)
    except Exception:
        return {"error": "secret timeout"}
    if sec_res.returncode != 0:
        return {"error": "Failed to access db credentials secret"}
        
    node_cmd = ["node", str(cred_helper)]
    try:
        node_res = run_bounded(node_cmd, input_str=sec_res.stdout, timeout_sec=10)
    except Exception:
        return {"error": "node timeout"}
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
                   PGOPTIONS="-c default_transaction_read_only=on -c default_transaction_isolation=repeatable_read -c statement_timeout=10000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=10000")
        
        proxy_path = os.environ.get("RUNNER_TEMP", "/tmp") + "/cloud-sql-proxy"
        proxy_process = None
        if os.path.exists(proxy_path):
            proxy_process = subprocess.Popen([proxy_path, "--address=127.0.0.1", "--port=5432",
                                        f"{PROJECT}:{REGION}:{INSTANCE}"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            # bounded readiness probe
            import time
            ready = False
            for _ in range(15):
                try:
                    c = run_bounded(["psql", "-X", "-q", "-A", "-t", "--no-password", "-c", "SELECT 1"], env=env, timeout_sec=2)
                    if c.returncode == 0:
                        ready = True
                        break
                except Exception:
                    pass
                time.sleep(1)
            if not ready:
                proxy_process.terminate()
                try:
                    proxy_process.wait(timeout=5)
                except Exception:
                    proxy_process.kill()
                    proxy_process.wait()
                return {"error": "proxy readiness timeout"}
        else:
            return {"error": "cloud-sql-proxy not found"}
            
        try:
            sql_file = Path(td) / "query.sql"
            sql_file.write_text(query)
            
            psql_cmd = ["psql", "-X", "-q", "-A", "-t", "--no-password", "--set=ON_ERROR_STOP=1", "--file=" + str(sql_file)]
            res = run_bounded(psql_cmd, env=env, timeout_sec=30)
            if res.returncode != 0:
                return {"error": f"psql failed"}
                
            rows = []
            for line in res.stdout.strip().split("\n"):
                if line:
                    rows.append(line.split("|"))
            return {"rows": rows}
        except Exception:
            return {"error": "psql timeout"}
        finally:
            if proxy_process and proxy_process.poll() is None:
                proxy_process.terminate()
                try:
                    proxy_process.wait(timeout=5)
                except Exception:
                    proxy_process.kill()
                    proxy_process.wait()


def run_bounded(cmd, input_str=None, timeout_sec=30, max_stdout=512*1024, max_stderr=128*1024, env=None):
    import time, select, subprocess, os
    start_time = time.time()
    try:
        p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, stdin=subprocess.PIPE if input_str else None, env=env)
    except Exception as e:
        return type('obj', (object,), {'returncode': -1, 'stdout': '', 'stderr': str(e)})()
        
    if input_str:
        os.set_blocking(p.stdin.fileno(), False)
        try:
             p.stdin.write(input_str.encode('utf-8'))
             p.stdin.close()
        except:
             pass
    
    body = b""
    stderr_data = b""
    os.set_blocking(p.stdout.fileno(), False)
    os.set_blocking(p.stderr.fileno(), False)
    
    while True:
        if time.time() - start_time > timeout_sec:
            p.kill()
            p.wait()
            return type('obj', (object,), {'returncode': -1, 'stdout': '', 'stderr': 'timeout'})()
            
        r, _, _ = select.select([p.stdout, p.stderr], [], [], 1.0)
        
        if p.stdout in r:
            chunk = os.read(p.stdout.fileno(), 4096)
            if chunk:
                body += chunk
                if len(body) > max_stdout:
                    p.kill()
                    p.wait()
                    return type('obj', (object,), {'returncode': -1, 'stdout': '', 'stderr': 'stdout too large'})()
                    
        if p.stderr in r:
            chunk = os.read(p.stderr.fileno(), 4096)
            if chunk:
                stderr_data += chunk
                if len(stderr_data) > max_stderr:
                    p.kill()
                    p.wait()
                    return type('obj', (object,), {'returncode': -1, 'stdout': '', 'stderr': 'stderr too large'})()
                    
        if p.poll() is not None:
            while True:
                r2, _, _ = select.select([p.stdout, p.stderr], [], [], 0.0)
                progress = False
                if p.stdout in r2:
                    chunk = os.read(p.stdout.fileno(), 4096)
                    if chunk:
                        body += chunk
                        if len(body) > max_stdout:
                            return type('obj', (object,), {'returncode': -1, 'stdout': '', 'stderr': 'stdout too large'})()
                        progress = True
                if p.stderr in r2:
                    chunk = os.read(p.stderr.fileno(), 4096)
                    if chunk:
                        stderr_data += chunk
                        if len(stderr_data) > max_stderr:
                            return type('obj', (object,), {'returncode': -1, 'stdout': '', 'stderr': 'stderr too large'})()
                        progress = True
                if not progress:
                    break
            break
            
    return type('obj', (object,), {'returncode': p.returncode, 'stdout': body.decode('utf-8', 'replace'), 'stderr': stderr_data.decode('utf-8', 'replace')})()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mock-db", action="store_true")
    parser.add_argument("--product-run-id", type=str, default="")
    parser.add_argument("--artifact-id", type=str, default="")
    parser.add_argument("--source-sha", type=str, default="")
    parser.add_argument("--workflow-def-sha", type=str, default="")
    parser.add_argument("--cloud-metadata", type=str, default="")
    parser.add_argument("--current-run-id", type=str, default="")
    parser.add_argument("--current-runtime-sha", type=str, default="")
    parser.add_argument("--tooling-run-sha", type=str, default="")
    args = parser.parse_args()
    
    report = {
        "assessment_only": True, 
        "cleanup_not_performed": True, 
        "available_apply_operation": False,
        "provenance": AUTHORIZED_PROVENANCE
    }
    
    try:
        if args.cloud_metadata and os.path.exists(args.cloud_metadata):
            size = os.path.getsize(args.cloud_metadata)
            require(size <= 512 * 1024, "Cloud metadata file too large")
            with open(args.cloud_metadata, 'r') as f:
                content = f.read(512 * 1024)
                require(len(f.read(1)) == 0, "Cloud metadata file exceeds byte cap")
                cm = json.loads(content)
                require(cm.get("schema") == "dev-readonly-cloud-metadata-v1", "Metadata schema mismatch")
                require(cm.get("project") == PROJECT, "Metadata project mismatch")
                require(cm.get("region") == REGION, "Metadata region mismatch")
                require(cm.get("definition_sha") == AUTHORIZED_PROVENANCE["workflow_sha"], "Metadata definition mismatch")
                
                import datetime
                try:
                    obs = datetime.datetime.fromisoformat(cm.get("observed_at", "").replace("Z", "+00:00"))
                    now = datetime.datetime.now(datetime.timezone.utc)
                    require((now - obs).total_seconds() < 3600 and (now - obs).total_seconds() >= 0, "Cloud metadata is not fresh")
                except Exception:
                    raise ValueError("Invalid metadata observed_at")
                
                services = cm.get("services", {})
                expected_services = [
                    "drts-channel-partner-portal-web", "drts-dev-api", "drts-dev-bank-console-web",
                    "drts-dev-enterprise-dispatch-web", "drts-dev-fleet-partner-portal-web",
                    "drts-dev-ops-console-web", "drts-dev-platform-admin-web", "drts-dev-scanner",
                    "drts-dev-tenant-console-web"
                ]
                require(len(services) == 9, "Expected exactly 9 services in metadata")
                require(set(services.keys()) == set(expected_services), "Service names mismatch")
                
                validated_services = {}
                for name, s in services.items():
                    if name == "drts-dev-api":
                        require(s.get("runtime_sha") == args.current_runtime_sha, f"Runtime SHA mismatch for {name}")
                        require(s.get("identity") == f"drts-dev-runtime@{PROJECT}.iam.gserviceaccount.com", f"Identity mismatch for {name}")
                        prov = s.get("providers", {})
                        require(prov.get("DOCUMENT_ARTIFACT_GCS_BUCKET") == BUCKET, "API artifact bucket mismatch")
                        require(prov.get("DOCUMENT_ARTIFACT_STORAGE_PROVIDER") == "gcs", "API artifact provider mismatch")
                        validated_services[name] = {
                            "runtime_sha": s.get("runtime_sha"),
                            "identity": s.get("identity"),
                            "providers": {
                                "DOCUMENT_ARTIFACT_GCS_BUCKET": prov.get("DOCUMENT_ARTIFACT_GCS_BUCKET"),
                                "DOCUMENT_ARTIFACT_STORAGE_PROVIDER": prov.get("DOCUMENT_ARTIFACT_STORAGE_PROVIDER")
                            }
                        }
                    elif name == "drts-dev-scanner":
                        require(s.get("identity") == f"drts-dev-artifact-scanner@{PROJECT}.iam.gserviceaccount.com", f"Identity mismatch for {name}")
                        require(s.get("spec_sha256") == "78d699ef021ef42c4346cdaeea539e7df00ff7c53cd8c2c89278c7c52403f4ad", "Scanner spec SHA mismatch")
                        validated_services[name] = {
                            "identity": s.get("identity"),
                            "spec_sha256": s.get("spec_sha256")
                        }
                    else:
                        require(s.get("identity") == f"drts-dev-runtime@{PROJECT}.iam.gserviceaccount.com", f"Identity mismatch for {name}")
                        # Private consoles should have no bindings or no allUsers/allAuthenticatedUsers
                        bindings = s.get("bindings")
                        require(bindings is not None, f"Console {name} bindings missing/bypass")
                        require(isinstance(bindings, list), f"Console {name} bindings malformed")
                        validated_bindings = []
                        for b in bindings:
                            require(isinstance(b, dict), f"Console {name} binding malformed")
                            members = b.get("members", [])
                            require(isinstance(members, list), f"Console {name} binding members malformed")
                            require("allUsers" not in members and "allAuthenticatedUsers" not in members, f"Console {name} is not private")
                            role = b.get("role")
                            if role is not None:
                                validated_bindings.append({"role": role, "members": members})
                        validated_services[name] = {
                            "identity": s.get("identity"),
                            "bindings": validated_bindings
                        }

                
                report["cloud_metadata"] = {
                    "project": cm.get("project"),
                    "region": cm.get("region"),
                    "definition_sha": cm.get("definition_sha"),
                    "observed_at": cm.get("observed_at"),
                    "services": validated_services
                }
                
                require(args.current_run_id, "Missing current_run_id")
                res_run = run_bounded(["gh", "api", f"/repos/ajoe734/drts-fleet-platform/actions/runs/{args.current_run_id}"], timeout_sec=30)
                require(res_run.returncode == 0, "Failed to fetch current run from GitHub API")
                curr_run_data = json.loads(res_run.stdout)
                require(curr_run_data.get("head_branch") == "dev", "Current run not on protected dev branch")
                require(curr_run_data.get("event") == "workflow_dispatch", "Current run not authorized trigger")
                require(str(curr_run_data.get("id")) == args.current_run_id, "Current run ID mismatch")
                require(curr_run_data.get("head_sha") == args.tooling_run_sha, "Current run SHA mismatch")
                
                # CI status check
                res_ci = run_bounded(["gh", "api", f"/repos/ajoe734/drts-fleet-platform/commits/{args.tooling_run_sha}/check-suites"], timeout_sec=30)
                require(res_ci.returncode == 0, "Failed to fetch check-suites")
                ci_data = json.loads(res_ci.stdout)
                suites = ci_data.get("check_suites", [])
                require(any(s.get("status") == "completed" and s.get("conclusion") == "success" for s in suites), "tooling_run_sha must have passing CI")
                
                # No overlap check
                res_overlap = run_bounded(["gh", "api", "/repos/ajoe734/drts-fleet-platform/actions/runs?status=in_progress&per_page=100"], timeout_sec=30)
                require(res_overlap.returncode == 0, "Failed to fetch active runs")
                overlap_data = json.loads(res_overlap.stdout)
                import re as regex_mod
                active_runs = [r for r in overlap_data.get("workflow_runs", []) if str(r.get("id")) != args.current_run_id and regex_mod.search(r"deploy|restore|provision|provider|scanner", r.get("name", ""), regex_mod.IGNORECASE)]
                require(len(active_runs) == 0, "Overlapping restricted workflows detected")
                
                curr_jobs = []
                page = 1
                while True:
                    res_jobs = run_bounded(["gh", "api", f"/repos/ajoe734/drts-fleet-platform/actions/runs/{args.current_run_id}/jobs?per_page=100&page={page}"], timeout_sec=30)
                    require(res_jobs.returncode == 0, "Failed to fetch current run jobs")
                    page_jobs = json.loads(res_jobs.stdout).get("jobs", [])
                    if not page_jobs:
                        break
                    curr_jobs.extend(page_jobs)
                    if len(page_jobs) < 100:
                        break
                    page += 1
                
                # Check for operator environment binding (reservation) by confirming the specific job name that has the environment
                op_envs = [j for j in curr_jobs if j.get("name") == "Owned fixture assessment (Read-only GCS / DB)"]
                require(len(op_envs) > 0, "No Owned fixture assessment job found in current jobs")
                require(curr_run_data.get("path") == ".github/workflows/dev-owned-operational-fixture-assessment.yml", "Current run path mismatch")

                    
        else:
            require(args.mock_db, "Missing cloud metadata receipt")

        if args.mock_db:
            report["disposition"] = "synthetic"
            gcs_res = {"status": "success", "validated_count": len(CANONICAL_OWNED_OBJECTS), "receipts": []}
            report["gcs_assessment"] = gcs_res
            report["db_assessment"] = {"status": "skipped_due_to_mock"}
            out = json.dumps({"schema": "dev-owned-assessment-report-v1", "payload": report}, indent=2)
            require(len(out.encode('utf-8')) <= 512 * 1024, "Report exceeds byte cap")
            print(out)
            sys.exit(1)
        else:
            fetch_and_validate_provenance(args)
            gcs_res = assess_gcs_objects(default_gcs_runner)
            report["gcs_assessment"] = gcs_res
            
            if gcs_res.get("status") != "success":
                report["disposition"] = "rejected"
                out = json.dumps({"schema": "dev-owned-assessment-report-v1", "payload": report}, indent=2)
                require(len(out.encode('utf-8')) <= 512 * 1024, "Report exceeds byte cap")
                print(out)
                sys.exit(1)
            
            db_res = assess_database(default_db_runner)
            report["db_assessment"] = db_res
            if db_res.get("status") != "success":
                report["disposition"] = "rejected"
                if "concrete_blocker" in db_res:
                     report["concrete_blocker"] = db_res["concrete_blocker"]
                out = json.dumps({"schema": "dev-owned-assessment-report-v1", "payload": report}, indent=2)
                require(len(out.encode('utf-8')) <= 512 * 1024, "Report exceeds byte cap")
                print(out)
                sys.exit(1)
            else:
                report["disposition"] = "complete"
                
            out = json.dumps({"schema": "dev-owned-assessment-report-v1", "payload": report}, indent=2)
            require(len(out.encode('utf-8')) <= 512 * 1024, "Report exceeds byte cap")
            print(out)
            sys.exit(0)
    except Exception as e:
        error_report = {
            "assessment_only": True,
            "cleanup_not_performed": True,
            "available_apply_operation": False,
            "provenance": AUTHORIZED_PROVENANCE,
            "disposition": "error",
            "error": str(e)[:128]
        }
        out = json.dumps({"schema": "dev-owned-assessment-report-v1", "payload": error_report}, indent=2)
        print(out)
        sys.exit(1)

if __name__ == "__main__":
    main()
