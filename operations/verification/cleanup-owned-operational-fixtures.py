#!/usr/bin/env python3
"""Fail-closed cleanup planner and read-only simulator for owned operational fixtures.

This script plans generation-bound GCS deletion for the exact eight 327-byte 
PDF objects created during authorized product run 37906298090, and inspects
database boundaries for owned submission and document records. It strictly
preserves business audit/cancellation records, seeded demo entities, and
historical failed fixtures (8d / 03a).

Safety & Governance Constraints:
- Default and ONLY supported execution mode is read-only simulation / 'dry-run'.
- Mutation entrypoints are unconditionally DISABLED. The required database execution 
  contract is unavailable without violating safety, and thus apply mode is blocked.
- Fixed project: drts-dev-devcc-20260825, region: us-central1.
- Fixed bucket: drts-dev-devcc-20260825-document-artifacts.
- Strict provenance binding: run 37906298090, source 4a166f3ed2a7000061acc737ee475ae3c47dca56,
  workflow definition 9a1b6466a8b15d7d328e9ceba33ba5dc92f7fa9c, artifact 11606165993.
- Authoritative artifact retrieval & verification: binds explicit artifact metadata, digest,
  operational report statistics (16 passed / 0 failed / 0 skipped), and evidence records.
- Physical key mapping: derives physical GCS object keys per the immutable
  GcsDocumentArtifactStoreAdapter contract.
- External mutations are securely disabled. Local parsing and planning use only stdlib, but inspecting a genuine artifact without --offline delegates to the gcloud CLI to query live object metadata over the network.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import datetime
import zipfile
import urllib.parse
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Sequence, Set, Tuple

PROJECT = "drts-dev-devcc-20260825"
REGION = "us-central1"
BUCKET = f"{PROJECT}-document-artifacts"
EXPECTED_PRODUCT_RUN_ID = 37906298090
EXPECTED_SOURCE_SHA = "4a166f3ed2a7000061acc737ee475ae3c47dca56"
EXPECTED_WORKFLOW_DEF_SHA = "9a1b6466a8b15d7d328e9ceba33ba5dc92f7fa9c"
EXPECTED_ARTIFACT_ID = 11606165993
EXPECTED_ARTIFACT_NAME = (
    f"operational-browser-evidence-{EXPECTED_SOURCE_SHA}"
)
EXPECTED_ARTIFACT_DIGEST = (
    "sha256:2fc9ef568f7b37cf709475fd1e1bb470f1b18e55383751254cef179753b539b5"
)
EXPECTED_FILE_SIZE = 327
EXPECTED_SHA256 = (
    "4028af3714fa07d2f20e758649532faef11b4818c99a2b8dc0c88170a0dc8784"
)
EXPECTED_MIME = "application/pdf"
KEY_PREFIX = "fleet-partner/fleet-demo-001/supply-submissions/"
EXPECTED_FLEET_PARTNER_ID = "fleet-demo-001"
EXPECTED_FULL_RUN_START = "2026-10-09T08:39:23Z"
EXPECTED_FULL_RUN_END = "2026-10-09T09:04:10Z"
EXPECTED_RUN_BOUNDS_START = "2026-10-09T09:01:12Z"
EXPECTED_RUN_BOUNDS_END = "2026-10-09T09:04:01Z"

OWNED_OBJECT_COUNT = 8
OWNED_SUBMISSION_COUNT = 4

KIND_FLEET_UPLOAD_CONTENT = "fleet-upload-content"
DOCUMENT_ARTIFACTS_PREFIX = "document-artifacts"


def logical_to_physical_gcs_key(
    logical_key: str, kind: str = KIND_FLEET_UPLOAD_CONTENT
) -> str:
    """Derive physical GCS object key using the immutable GcsDocumentArtifactStoreAdapter contract.

    Contract: document-artifacts/{kind}/{encodeURIComponent(subjectId)}
    Note: urllib.parse.quote(logical_key, safe="") produces encodeURIComponent behavior,
    encoding '/' as '%2F' and preserving valid URL characters.
    """
    encoded_subject = urllib.parse.quote(logical_key, safe="")
    return f"{DOCUMENT_ARTIFACTS_PREFIX}/{kind}/{encoded_subject}"


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

PRESERVED_BUSINESS_RECORDS: Tuple[str, ...] = (
    "6d571eec-f271-46b8-b01f-b176994fe71e",  # referral booking (cancelled)
    "booking-2e367210-fc7b-4bf0-9512-8ff7626b5165",  # enterprise booking (cancelled)
)

PRESERVED_SEEDED_PARTNERS: Tuple[str, ...] = (
    "fleet-demo-001",
)

DB_CONCRETE_BLOCKER = (
    "Current authorized hosted deployment provides Cloud SQL and DATABASE_URL "
    "secret injection exclusively via the Cloud Run migration job (drts-dev-migrate) built from "
    "Dockerfile.migrate. That image has a fixed entrypoint (['bash', 'operations/database/db-apply.sh']) "
    "that executes only schema migrations from infra/migrations/ and lacks this new cleanup tool. "
    "The default migration job definition cannot be mutated or overridden under repository governance. "
    "Additionally, database schema inspection (V0034) confirms fleet.supply_review_events references "
    "fleet.supply_submissions without ON DELETE CASCADE; review events are protected audit records that "
    "must never be deleted, which legally and referentially prevents deletion of reviewed parent submissions. "
    "Consequently, apply mode is blocked before any GCS mutation until an authorized, reviewed, and non-mutating "
    "hosted DB execution contract is established."
)


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def validate_full_sha(value: Any, name: str = "SHA") -> str:
    require(
        isinstance(value, str) and bool(re.fullmatch(r"[0-9a-f]{40}", value)),
        f"Expected immutable 40-character lowercase hex {name}, got: {value!r}",
    )
    return value.lower()


def validate_uuid(value: Any, name: str = "UUID") -> str:
    require(
        isinstance(value, str)
        and bool(
            re.fullmatch(
                r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
                value,
                re.IGNORECASE,
            )
        ),
        f"Expected valid canonical UUID for {name}, got: {value!r}",
    )
    return value.lower()


def validate_provenance(
    inventory_or_evidence: Dict[str, Any],
    run_id: Optional[int] = None,
    source_sha: Optional[str] = None,
    definition_sha: Optional[str] = None,
    artifact_id: Optional[int] = None,
    artifact_digest: Optional[str] = None,
) -> None:
    expected_run = run_id or EXPECTED_PRODUCT_RUN_ID
    require(
        expected_run == EXPECTED_PRODUCT_RUN_ID,
        f"Enforced product run ID mismatch: expected {EXPECTED_PRODUCT_RUN_ID}, got {expected_run}",
    )

    expected_src = validate_full_sha(
        source_sha or EXPECTED_SOURCE_SHA, "source_sha"
    )
    require(
        expected_src == EXPECTED_SOURCE_SHA,
        f"Enforced source SHA mismatch: expected {EXPECTED_SOURCE_SHA}, got {expected_src}",
    )

    actual_source = (
        inventory_or_evidence.get("source_sha")
        or inventory_or_evidence.get("source_runtime_sha")
        or inventory_or_evidence.get("candidateSha")
    )
    require(
        actual_source is not None,
        f"Missing required source SHA in provenance: expected {expected_src}",
    )
    require(
        actual_source == expected_src,
        f"Source SHA mismatch: expected {expected_src}, got {actual_source}",
    )

    actual_run = (
        inventory_or_evidence.get("run_id")
        or inventory_or_evidence.get("product_run_id")
    )
    require(
        actual_run is not None,
        f"Product run ID missing in provenance: expected {expected_run}",
    )
    require(
        int(actual_run) == expected_run,
        f"Product run ID mismatch: expected {expected_run}, got {actual_run}",
    )

    expected_def = validate_full_sha(
        definition_sha or EXPECTED_WORKFLOW_DEF_SHA, "definition_sha"
    )
    actual_def = inventory_or_evidence.get("workflow_definition_sha")
    if actual_def is not None:
        require(
            actual_def == expected_def,
            f"Workflow definition SHA mismatch: expected {expected_def}, got {actual_def}",
        )

    run_bounds = inventory_or_evidence.get("run_bounds")
    require(run_bounds is not None, "Missing mandatory run_bounds in provenance")
    start_bound = run_bounds.get("start")
    end_bound = run_bounds.get("end")
    require(
        start_bound == EXPECTED_RUN_BOUNDS_START,
        f"run_bounds start mismatch: expected {EXPECTED_RUN_BOUNDS_START}, got {start_bound}",
    )
    require(
        end_bound == EXPECTED_RUN_BOUNDS_END,
        f"run_bounds end mismatch: expected {EXPECTED_RUN_BOUNDS_END}, got {end_bound}",
    )

    if artifact_id is not None:
        require(
            int(artifact_id) == EXPECTED_ARTIFACT_ID,
            f"Artifact ID mismatch: expected {EXPECTED_ARTIFACT_ID}, got {artifact_id}",
        )

    actual_art_id = inventory_or_evidence.get("artifact_id")
    if actual_art_id is not None:
        require(
            int(actual_art_id) == EXPECTED_ARTIFACT_ID,
            f"Artifact ID mismatch in data: expected {EXPECTED_ARTIFACT_ID}, got {actual_art_id}",
        )

    if artifact_digest:
        require(
            artifact_digest == EXPECTED_ARTIFACT_DIGEST,
            f"Artifact digest mismatch: expected {EXPECTED_ARTIFACT_DIGEST}, got {artifact_digest}",
        )


def validate_inventory_items(
    inventory_data: Dict[str, Any],
) -> List[Dict[str, Any]]:
    docs = inventory_data.get("storage_documents")
    require(isinstance(docs, list), "storage_documents must be a list")
    require(
        len(docs) == OWNED_OBJECT_COUNT,
        f"Expected exactly {OWNED_OBJECT_COUNT} storage documents, found {len(docs)}",
    )

    seen_doc_ids: Set[str] = set()
    seen_keys: Set[str] = set()
    validated_docs: List[Dict[str, Any]] = []

    for item in docs:
        require(isinstance(item, dict), "Storage document entry must be an object")
        doc_id = validate_uuid(item.get("documentId"), "documentId")
        sub_id = validate_uuid(
            item.get("confirmSubmissionId"), "confirmSubmissionId"
        )
        fleet_id = item.get("confirmFleetPartnerId")
        key = item.get("objectKey")
        file_size = item.get("fileSize")
        sha256 = item.get("sha256")
        content_type = item.get("readbackContentType")

        require(
            fleet_id == EXPECTED_FLEET_PARTNER_ID,
            f"Foreign fleetPartnerId: {fleet_id} (expected {EXPECTED_FLEET_PARTNER_ID})",
        )
        require(isinstance(key, str), "Missing or invalid objectKey")
        require(
            key.startswith(KEY_PREFIX),
            f"Key does not match required owned prefix '{KEY_PREFIX}': {key}",
        )
        require(".." not in key, f"Path traversal rejected in objectKey: {key}")
        require(doc_id not in seen_doc_ids, f"Duplicate documentId: {doc_id}")
        require(key not in seen_keys, f"Duplicate objectKey: {key}")
        seen_doc_ids.add(doc_id)
        seen_keys.add(key)

        require(
            key in CANONICAL_OWNED_OBJECTS,
            f"Object key is not in canonical owned list: {key}",
        )

        canonical = CANONICAL_OWNED_OBJECTS[key]
        require(
            canonical["documentId"] == doc_id,
            f"Document ID mismatch for key {key}: expected {canonical['documentId']}, got {doc_id}",
        )
        require(
            canonical["confirmSubmissionId"] == sub_id,
            f"Submission ID mismatch for key {key}: expected {canonical['confirmSubmissionId']}, got {sub_id}",
        )
        require(
            item.get("confirmDocumentType") == canonical["document_type"],
            f"Document type mismatch for key {key}",
        )
        require(
            file_size == EXPECTED_FILE_SIZE,
            f"Unexpected file size: {file_size} (expected {EXPECTED_FILE_SIZE})",
        )
        require(
            sha256 == EXPECTED_SHA256,
            f"Unexpected SHA-256 hash: {sha256} (expected {EXPECTED_SHA256})",
        )
        require(
            content_type == EXPECTED_MIME,
            f"Unexpected content type: {content_type} (expected {EXPECTED_MIME})",
        )

        validated_docs.append(
            {
                "documentId": doc_id,
                "confirmSubmissionId": sub_id,
                "fleet_partner_id": fleet_id,
                "object_key": key,
                "document_type": canonical["document_type"],
                "file_size": file_size,
                "sha256": sha256,
                "content_type": content_type,
            }
        )

    # Validate preservation fields in inventory
    require(
        inventory_data.get("preserve_failed_8d_03a_and_user_data") is True,
        "Inventory must explicitly declare preserve_failed_8d_03a_and_user_data=True",
    )

    # Validate mutation records preservation (cancellations must be recorded and preserved, not deleted)
    mutations = inventory_data.get("mutation_records", [])
    cancelled_business_records: Set[str] = set()
    for rec in mutations:
        result_id = rec.get("resultId")
        if result_id in PRESERVED_BUSINESS_RECORDS:
            if rec.get("operation") == "cancel" or rec.get("readbackState") == "cancelled":
                cancelled_business_records.add(result_id)

    for expected_cancelled in PRESERVED_BUSINESS_RECORDS:
        require(
            expected_cancelled in cancelled_business_records,
            f"Business record {expected_cancelled} must have a cancellation audit record",
        )

    return validated_docs


def load_and_validate_authoritative_artifact(
    artifact_dir: Path,
    expected_artifact_id: int = EXPECTED_ARTIFACT_ID,
    expected_run_id: int = EXPECTED_PRODUCT_RUN_ID,
    expected_source_sha: str = EXPECTED_SOURCE_SHA,
    expected_workflow_def_sha: str = EXPECTED_WORKFLOW_DEF_SHA,
) -> Dict[str, Any]:
    """Parse and validate authoritative GitHub artifact, report, and evidence files.

    Expects:
    - artifact_dir containing artifacts.json (mandatory metadata)
    - report.json (mandatory stats: 16 expected, 0 unexpected, 0 skipped, 0 flaky)
    - operational-browser-evidence.json (mandatory clean 200/201 checks, timestamps, digests)
    """
    require(artifact_dir.is_dir(), f"Artifact directory not found: {artifact_dir}")

    # 1. Validate GitHub API artifact metadata (artifacts.json is MANDATORY)
    art_meta_candidates = [
        artifact_dir / "artifacts.json",
        artifact_dir.parent / "artifacts.json",
        artifact_dir.parent.parent / "artifacts.json",
    ]
    art_meta_path = next((p for p in art_meta_candidates if p.is_file()), None)
    require(
        art_meta_path is not None,
        f"artifacts.json not found under {artifact_dir} (or its parents); authoritative artifact metadata is mandatory",
    )
    with open(art_meta_path, "r", encoding="utf-8") as f:
        art_meta = json.load(f)
    artifacts_list = art_meta.get("artifacts", [])
    require(len(artifacts_list) > 0, "No artifacts found in artifacts.json")
    target_art = None
    for art in artifacts_list:
        if art.get("id") == expected_artifact_id:
            target_art = art
            break
    require(
        target_art is not None,
        f"Authoritative artifact {expected_artifact_id} not found in artifacts.json",
    )
    require(
        target_art.get("name") == EXPECTED_ARTIFACT_NAME,
        f"Artifact name mismatch: expected {EXPECTED_ARTIFACT_NAME}, got {target_art.get('name')}",
    )
    actual_digest = target_art.get("digest")
    require(
        actual_digest is not None,
        f"Artifact digest missing in artifacts.json for artifact {expected_artifact_id}",
    )
    require(
        actual_digest == EXPECTED_ARTIFACT_DIGEST,
        f"Artifact digest mismatch: expected {EXPECTED_ARTIFACT_DIGEST}, got {actual_digest}",
    )
    wf_run = target_art.get("workflow_run", {})
    require(
        wf_run.get("id") == expected_run_id,
        f"Artifact run ID mismatch: expected {expected_run_id}, got {wf_run.get('id')}",
    )
    require(
        wf_run.get("head_sha") == expected_workflow_def_sha,
        f"Artifact workflow def SHA mismatch: expected {expected_workflow_def_sha}, got {wf_run.get('head_sha')}",
    )

    # Enforce archive hashing to prevent accepting tampered extracted evidence
    zip_candidates = list(artifact_dir.glob("*.zip"))
    if not zip_candidates:
        return {
            "unverified_planning_only": True,
            "error_reason": "No archive zip found for hashing. Tampered extracted evidence accepted without archive hashing/run/jobs proof is rejected. Providing explicitly unverified local planning.",
            "source_sha": expected_source_sha,
            "run_id": expected_run_id,
            "cleanup_not_performed": True,
            "preserve_failed_8d_03a_and_user_data": True,
        }

    zip_path = zip_candidates[0]
    zip_hash = hashlib.sha256(zip_path.read_bytes()).hexdigest()
    expected_raw_hash = EXPECTED_ARTIFACT_DIGEST.replace("sha256:", "") if "sha256:" in EXPECTED_ARTIFACT_DIGEST else EXPECTED_ARTIFACT_DIGEST
    require(
        zip_hash == expected_raw_hash,
        f"Archive hash mismatch: expected {expected_raw_hash}, got {zip_hash}"
    )

    # 1.5 Validate run.json and jobs.json
    run_meta_path = artifact_dir / "run.json"
    if not run_meta_path.is_file():
        run_meta_path = artifact_dir.parent / "run.json"
    require(run_meta_path.is_file(), f"run.json not found under {artifact_dir}")
    with open(run_meta_path, "r", encoding="utf-8") as f:
        run_meta = json.load(f)
    require(run_meta.get("id") == expected_run_id, f"run.json ID mismatch: expected {expected_run_id}, got {run_meta.get('id')}")
    require(run_meta.get("head_sha") == expected_workflow_def_sha, f"run.json head_sha mismatch: expected {expected_workflow_def_sha}, got {run_meta.get('head_sha')}")
    require(run_meta.get("status") == "completed", f"run.json status mismatch: expected completed, got {run_meta.get('status')}")
    require(run_meta.get("conclusion") == "success", f"run.json conclusion mismatch: expected success, got {run_meta.get('conclusion')}")
    require(run_meta.get("repository", {}).get("full_name") == "ajoe734/drts-fleet-platform", f"run.json repository mismatch")

    jobs_meta_path = artifact_dir / "jobs.json"
    if not jobs_meta_path.is_file():
        jobs_meta_path = artifact_dir.parent / "jobs.json"
    require(jobs_meta_path.is_file(), f"jobs.json not found under {artifact_dir}")
    with open(jobs_meta_path, "r", encoding="utf-8") as f:
        jobs_meta = json.load(f)
    jobs_list = jobs_meta.get("jobs")
    require(isinstance(jobs_list, list), "Invalid jobs.json: missing jobs list")
    require(jobs_meta.get("total_count") == 9, f"Expected total_count 9, got {jobs_meta.get('total_count')}")
    
    acceptance_jobs = [job for job in jobs_list if job.get("name") and "acceptance" in job.get("name", "").lower()]
    require(len(acceptance_jobs) == 1, f"Expected exactly 1 acceptance job, found {len(acceptance_jobs)}")
    acceptance_job = acceptance_jobs[0]
            
    require(len(jobs_list) == 9, f"Expected exactly 9 required jobs in run, got {len(jobs_list)}")
    require(acceptance_job.get("id") == 113747921500, f"Acceptance job ID mismatch: expected 113747921500, got {acceptance_job.get('id')}")
    require(acceptance_job.get("status") == "completed", "Acceptance job is not completed")
    require(acceptance_job.get("conclusion") == "success", "Acceptance job was not successful")
    require(acceptance_job.get("run_id") == expected_run_id, f"Acceptance job run_id mismatch: expected {expected_run_id}")
    
    # Require unique identity binding and no missing fields
    require(acceptance_job.get("head_sha") == expected_workflow_def_sha, f"Acceptance job head_sha mismatch: expected {expected_workflow_def_sha}")
    html_url = acceptance_job.get("html_url", "")
    require(html_url == f"https://github.com/ajoe734/drts-fleet-platform/actions/runs/{expected_run_id}/job/113747921500", f"Acceptance job foreign repository/URL: {html_url}")
    api_url = acceptance_job.get("url", "")
    require(api_url == "https://api.github.com/repos/ajoe734/drts-fleet-platform/actions/jobs/113747921500", f"Acceptance job foreign API URL: {api_url}")

    # Establish the actual captured run/job interval from the run and acceptance job
    run_meta_path = artifact_dir / "run.json"
    if not run_meta_path.is_file():
        run_meta_path = artifact_dir.parent / "run.json"
    with open(run_meta_path, "r", encoding="utf-8") as f:
        run_meta = json.load(f)
    run_start_str = run_meta.get("run_started_at")
    require(run_start_str is not None, "run.json missing run_started_at")
    
    acc_started_str = acceptance_job.get("started_at")
    require(acc_started_str is not None, "acceptance job missing started_at")
    
    acc_completed_str = acceptance_job.get("completed_at")
    require(acc_completed_str is not None, "acceptance job missing completed_at")

    expected_job_ids = {
        113740473026, 113740518866, 113744327840, 113745681997,
        113746824327, 113747086904, 113747511276, 113747921500,
        113748909497
    }

    try:
        r_start = datetime.datetime.fromisoformat(run_start_str.replace("Z", "+00:00"))
        expected_full_run_start = datetime.datetime.fromisoformat(EXPECTED_FULL_RUN_START.replace("Z", "+00:00"))
        expected_full_run_end = datetime.datetime.fromisoformat(EXPECTED_FULL_RUN_END.replace("Z", "+00:00"))
        
        require(r_start == expected_full_run_start, f"Run start time mismatch: expected {EXPECTED_FULL_RUN_START}, got {run_start_str}")
        
        acc_start = datetime.datetime.fromisoformat(acc_started_str.replace("Z", "+00:00"))
        acc_end = datetime.datetime.fromisoformat(acc_completed_str.replace("Z", "+00:00"))
        require(r_start <= acc_start <= acc_end <= expected_full_run_end, "Invalid run/job temporal interval bounds")
    except ValueError as e:
        require(False, f"Malformed run bounds: {e}")

    # Check terminal status and identity for all jobs
    seen_job_ids = set()
    for job in jobs_list:
        job_id = job.get("id")
        require(job_id is not None, "Job missing id")
        require(job_id not in seen_job_ids, f"Duplicate job id: {job_id}")
        seen_job_ids.add(job_id)
        
        require(job.get("status") == "completed", f"Required job {job.get('name')} is not completed")
        require(job.get("conclusion") == "success", f"Required job {job.get('name')} was not successful")
        require(job.get("run_id") == expected_run_id, f"Job {job_id} run_id mismatch: {job.get('run_id')}")
        require(job.get("head_sha") == expected_workflow_def_sha, f"Job {job_id} head_sha mismatch")
        
        html_url = job.get("html_url", "")
        expected_html_prefix = f"https://github.com/ajoe734/drts-fleet-platform/actions/runs/{expected_run_id}/job/"
        require(html_url.startswith(expected_html_prefix), f"Job {job_id} foreign html_url: {html_url}")
        
        api_url = job.get("url", "")
        expected_api_prefix = f"https://api.github.com/repos/ajoe734/drts-fleet-platform/actions/jobs/{job_id}"
        require(api_url == expected_api_prefix, f"Job {job_id} foreign API URL: {api_url}")
        
        job_started = job.get("started_at")
        require(job_started is not None, f"Job {job_id} missing started_at")
        job_completed = job.get("completed_at")
        require(job_completed is not None, f"Job {job_id} missing completed_at")
        try:
            j_start = datetime.datetime.fromisoformat(job_started.replace("Z", "+00:00"))
            j_end = datetime.datetime.fromisoformat(job_completed.replace("Z", "+00:00"))
            require(r_start <= j_start <= j_end <= expected_full_run_end, f"Job {job_id} temporal interval out of bounds or reversed")
        except ValueError as e:
            require(False, f"Malformed job bounds for {job_id}: {e}")

    require(seen_job_ids == expected_job_ids, f"Captured jobs mismatch: missing {expected_job_ids - seen_job_ids} / foreign {seen_job_ids - expected_job_ids}")

    # 2. Locate and parse report.json and operational-browser-evidence.json directly from the hashed ZIP
    report_data = None
    evidence_data = None
    with zipfile.ZipFile(zip_path, 'r') as zf:
        for name in zf.namelist():
            if name.endswith("report.json"):
                report_data = json.loads(zf.read(name).decode("utf-8"))
            elif name.endswith("operational-browser-evidence.json"):
                evidence_data = json.loads(zf.read(name).decode("utf-8"))
    
    require(report_data is not None, f"report.json not found inside zip {zip_path}")
    require(evidence_data is not None, f"operational-browser-evidence.json not found inside zip {zip_path}")

    # 3. Validate report stats and bindings
    stats = report_data.get("stats", {})
    require(
        isinstance(stats, dict),
        f"Missing or invalid stats object in report.json: {stats}",
    )
    require(stats.get("expected") == 16, f"Expected 16 tests in report, got {stats.get('expected')}")
    require(stats.get("unexpected") == 0, f"Unexpected failures in report: {stats.get('unexpected')}")
    require(stats.get("skipped") == 0, f"Skipped tests in report: {stats.get('skipped')}")
    require(stats.get("flaky") == 0, f"Flaky tests in report: {stats.get('flaky')}")
    
    report_config = report_data.get("config", {}).get("metadata", {})
    require(report_config.get("ci", {}).get("commitHash") == expected_workflow_def_sha, "report.json config.metadata.ci.commitHash mismatch")
    require(report_config.get("gitCommit", {}).get("hash") == expected_source_sha, "report.json config.metadata.gitCommit.hash mismatch")
    require(str(expected_run_id) in report_config.get("ci", {}).get("buildHref", ""), "report.json config.metadata.ci.buildHref missing run_id")

    # 4. Validate evidence and extract storage documents + mutations

    require(
        evidence_data.get("candidateSha") == expected_source_sha,
        f"Evidence candidateSha mismatch: {evidence_data.get('candidateSha')}",
    )

    # Establish the actual captured run/job interval
    run_start_str = run_meta.get("run_started_at")
    require(run_start_str is not None, "run.json missing run_started_at")
    
    job_started_str = acceptance_job.get("started_at")
    require(job_started_str is not None, "acceptance job missing started_at")
    
    job_completed_str = acceptance_job.get("completed_at")
    require(job_completed_str is not None, "acceptance job missing completed_at")

    try:
        r_start = datetime.datetime.fromisoformat(run_start_str.replace("Z", "+00:00"))
        j_start = datetime.datetime.fromisoformat(job_started_str.replace("Z", "+00:00"))
        j_end = datetime.datetime.fromisoformat(job_completed_str.replace("Z", "+00:00"))
        require(r_start <= j_start <= j_end, "Invalid run/job temporal interval bounds")
    except ValueError as e:
        require(False, f"Malformed run bounds: {e}")

    raw_evidence = evidence_data.get("evidence", [])
    storage_docs: List[Dict[str, Any]] = []
    mutation_records: List[Dict[str, Any]] = []

    for entry in raw_evidence:
        kind = entry.get("kind")
        if kind == "setup-document-upload" or (
            isinstance(entry.get("objectKey"), str)
            and entry.get("objectKey", "").startswith(KEY_PREFIX)
        ):
            # Authoritative evidence MUST contain authentic ownership fields; no default synthesis
            require(entry.get("candidateSha") == expected_source_sha, "Evidence candidateSha mismatch")
            require(entry.get("intentStatus") == 201, "Evidence intentStatus mismatch or missing")
            require(entry.get("confirmStatus") == 201, "Evidence confirmStatus mismatch or missing")
            require(entry.get("readbackFileSize") == EXPECTED_FILE_SIZE, "Evidence readbackFileSize mismatch")
            require(
                entry.get("confirmSubmissionId") is not None,
                f"Missing confirmSubmissionId in evidence entry for {entry.get('objectKey')}",
            )
            require(
                entry.get("confirmFleetPartnerId") == EXPECTED_FLEET_PARTNER_ID,
                f"Invalid or missing confirmFleetPartnerId in evidence: {entry.get('confirmFleetPartnerId')}",
            )
            require(
                entry.get("confirmDocumentType") is not None,
                f"Missing confirmDocumentType in evidence entry for {entry.get('objectKey')}",
            )
            require(
                entry.get("readbackContentType") == EXPECTED_MIME,
                f"Invalid or missing readbackContentType: {entry.get('readbackContentType')}",
            )
            # Timestamp validity: must not be stale (must be from 2026 run)
            rec_at_str = entry.get("recordedAt")
            require(rec_at_str is not None and isinstance(rec_at_str, str), "Missing or invalid recordedAt timestamp")
            try:
                rec_at = datetime.datetime.fromisoformat(rec_at_str.replace("Z", "+00:00"))
                require(j_start <= rec_at <= j_end, f"Evidence timestamp {rec_at_str} out of bounds")
            except ValueError as e:
                require(False, f"Invalid evidence timestamp: {e}")
            # Must be clean successful status: putStatus 200/201, clean scan, downloadStatus 200, valid readback SHA
            put_status = entry.get("putStatus")
            require(
                put_status in (200, 201),
                f"Document upload putStatus failed or unverified: {put_status}",
            )
            scan_state = entry.get("putScanState")
            require(
                scan_state == "clean",
                f"Document scanState infected or pending: {scan_state}",
            )
            download_status = entry.get("downloadStatus")
            require(
                download_status == 200,
                f"Document downloadStatus failed: {download_status}",
            )
            readback_sha = entry.get("readbackSha256")
            require(
                readback_sha == EXPECTED_SHA256,
                f"Document readback SHA-256 mismatch: {readback_sha}",
            )

            storage_docs.append(dict(entry))

        if kind == "mutation-readback":
            mutation_records.append(entry)

    require(
        len(storage_docs) == OWNED_OBJECT_COUNT,
        f"Expected exactly {OWNED_OBJECT_COUNT} storage documents in evidence, got {len(storage_docs)}",
    )

    inventory_data = {
        "source_sha": expected_source_sha,
        "run_id": expected_run_id,
        "workflow_definition_sha": expected_workflow_def_sha,
        "artifact_id": expected_artifact_id,
        "artifact_digest": EXPECTED_ARTIFACT_DIGEST,
        "storage_documents": storage_docs,
        "mutation_records": mutation_records,
        "run_bounds": {"start": job_started_str, "end": job_completed_str},
        "cleanup_not_performed": True,
        "preserve_failed_8d_03a_and_user_data": True,
    }

    validate_provenance(
        inventory_data,
        run_id=expected_run_id,
        source_sha=expected_source_sha,
        definition_sha=expected_workflow_def_sha,
        artifact_id=expected_artifact_id,
        artifact_digest=EXPECTED_ARTIFACT_DIGEST,
    )
    validate_inventory_items(inventory_data)
    return inventory_data


def build_cleanup_plan(
    inventory_data: Dict[str, Any],
    mode: str = "dry-run",
    source_sha: Optional[str] = None,
    run_id: Optional[int] = None,
) -> Dict[str, Any]:
    require(mode in ("dry-run", "apply"), f"Invalid mode: {mode}")
    validate_provenance(inventory_data, run_id=run_id, source_sha=source_sha)
    validated_docs = validate_inventory_items(inventory_data)

    # Derive physical GCS keys using the immutable GcsDocumentArtifactStoreAdapter contract
    # Physical: document-artifacts/fleet-upload-content/<encodeURIComponent(logicalKey)>
    run_bounds = inventory_data.get("run_bounds")
    gcs_targets = []
    for doc in validated_docs:
        logical_key = doc["object_key"]
        physical_key = logical_to_physical_gcs_key(logical_key)
        target_dict = {
            "bucket": BUCKET,
            "key": physical_key,
            "physical_key": physical_key,
            "logical_key": logical_key,
            "expected_size": doc["file_size"],
            "expected_sha256": doc["sha256"],
            "expected_content_type": doc["content_type"],
            "documentId": doc["documentId"],
            "confirmSubmissionId": doc["confirmSubmissionId"],
            "authority_established": not inventory_data.get("unverified_planning_only", False),
        }
        if run_bounds:
            target_dict["run_bounds"] = run_bounds
        gcs_targets.append(target_dict)

    # Note: fleet.supply_review_events is NEVER deleted.
    # It is an audit record table referenced by foreign key constraints.
    db_targets = {
        "documents": [doc["documentId"] for doc in validated_docs],
        "submissions": list(CANONICAL_OWNED_SUBMISSIONS),
        "fleet_partner_id": EXPECTED_FLEET_PARTNER_ID,
        "guarded_statements": [
            {
                "table": "fleet.supply_documents",
                "operation": "SELECT_LOCK",
                "expected_rows": OWNED_OBJECT_COUNT,
                "sql": (
                    "SELECT document_id FROM fleet.supply_documents "
                    "WHERE document_id = ANY($1::uuid[]) "
                    "AND fleet_partner_id = $2 FOR UPDATE"
                ),
                "params": [
                    [doc["documentId"] for doc in validated_docs],
                    EXPECTED_FLEET_PARTNER_ID,
                ],
            },
            {
                "table": "fleet.supply_documents",
                "operation": "DELETE",
                "expected_rows": OWNED_OBJECT_COUNT,
                "sql": (
                    "DELETE FROM fleet.supply_documents "
                    "WHERE document_id = ANY($1::uuid[]) "
                    "AND fleet_partner_id = $2 "
                    "AND file_size = $3 "
                    "AND checksum_sha256 = $4"
                ),
                "params": [
                    [doc["documentId"] for doc in validated_docs],
                    EXPECTED_FLEET_PARTNER_ID,
                    EXPECTED_FILE_SIZE,
                    EXPECTED_SHA256,
                ],
            },
            {
                "table": "fleet.driver_supply_drafts",
                "operation": "SELECT_LOCK",
                "expected_rows": OWNED_SUBMISSION_COUNT,
                "sql": (
                    "SELECT submission_id FROM fleet.driver_supply_drafts "
                    "WHERE submission_id = ANY($1::uuid[]) FOR UPDATE"
                ),
                "params": [list(CANONICAL_OWNED_SUBMISSIONS)],
            },
            {
                "table": "fleet.driver_supply_drafts",
                "operation": "DELETE",
                "expected_rows": OWNED_SUBMISSION_COUNT,
                "sql": (
                    "DELETE FROM fleet.driver_supply_drafts "
                    "WHERE submission_id = ANY($1::uuid[])"
                ),
                "params": [list(CANONICAL_OWNED_SUBMISSIONS)],
            },
            {
                "table": "fleet.vehicle_supply_drafts",
                "operation": "SELECT_LOCK",
                "expected_rows": OWNED_SUBMISSION_COUNT,
                "sql": (
                    "SELECT submission_id FROM fleet.vehicle_supply_drafts "
                    "WHERE submission_id = ANY($1::uuid[]) FOR UPDATE"
                ),
                "params": [list(CANONICAL_OWNED_SUBMISSIONS)],
            },
            {
                "table": "fleet.vehicle_supply_drafts",
                "operation": "DELETE",
                "expected_rows": OWNED_SUBMISSION_COUNT,
                "sql": (
                    "DELETE FROM fleet.vehicle_supply_drafts "
                    "WHERE submission_id = ANY($1::uuid[])"
                ),
                "params": [list(CANONICAL_OWNED_SUBMISSIONS)],
            },
            {
                "table": "fleet.supply_submissions",
                "operation": "SELECT_LOCK",
                "expected_rows": OWNED_SUBMISSION_COUNT,
                "sql": (
                    "SELECT submission_id FROM fleet.supply_submissions "
                    "WHERE submission_id = ANY($1::uuid[]) "
                    "AND fleet_partner_id = $2 FOR UPDATE"
                ),
                "params": [
                    list(CANONICAL_OWNED_SUBMISSIONS),
                    EXPECTED_FLEET_PARTNER_ID,
                ],
            },
            {
                "table": "fleet.supply_submissions",
                "operation": "DELETE",
                "expected_rows": OWNED_SUBMISSION_COUNT,
                "sql": (
                    "DELETE FROM fleet.supply_submissions "
                    "WHERE submission_id = ANY($1::uuid[]) "
                    "AND fleet_partner_id = $2"
                ),
                "params": [
                    list(CANONICAL_OWNED_SUBMISSIONS),
                    EXPECTED_FLEET_PARTNER_ID,
                ],
            },
            {
                "table": "fleet.supply_submissions",
                "operation": "POSTFLIGHT_CHECK",
                "expected_count": 0,
                "sql": (
                    "SELECT count(*) as cnt FROM fleet.supply_submissions "
                    "WHERE submission_id = ANY($1::uuid[])"
                ),
                "params": [
                    list(CANONICAL_OWNED_SUBMISSIONS),
                ],
            },
            {
                "table": "fleet.supply_documents",
                "operation": "POSTFLIGHT_CHECK",
                "expected_count": 0,
                "sql": (
                    "SELECT count(*) as cnt FROM fleet.supply_documents "
                    "WHERE document_id = ANY($1::uuid[])"
                ),
                "params": [
                    [doc["documentId"] for doc in validated_docs],
                ],
            }
        ],
    }

    preservation_plan = {
        "preserved_business_records": list(PRESERVED_BUSINESS_RECORDS),
        "preserved_seeded_partners": list(PRESERVED_SEEDED_PARTNERS),
        "preserve_failed_historical_fixtures": ["8d", "03a"],
        "preserve_audit_logs": True,
        "preserved_audit_tables": ["fleet.supply_review_events", "audit.mutation_logs"],
        "preserve_intent_and_scan_records": True,
        "excluded_kinds": ["fleet-upload-intent", "fleet-scan-record"],
    }

    return {
        "mode": mode,
        "project": PROJECT,
        "region": REGION,
        "source_sha": EXPECTED_SOURCE_SHA,
        "product_run_id": EXPECTED_PRODUCT_RUN_ID,
        "gcs_targets": gcs_targets,
        "db_targets": db_targets,
        "preservation_plan": preservation_plan,
        "db_blocker": DB_CONCRETE_BLOCKER,
        "authority_established": not inventory_data.get("unverified_planning_only", False),
    }


def default_gcs_runner(
    action: str,
    bucket: str,
    key: str,
    generation: Optional[str] = None,
    timeout: int = 30,
) -> Dict[str, Any]:
    """Production gcloud storage boundary runner with strict error classification."""
    gs_url = f"gs://{bucket}/{key}"
    if action == "describe":
        cmd = [
            "gcloud",
            "storage",
            "objects",
            "describe",
            gs_url,
            "--format=json",
            "--project",
            PROJECT,
            "--quiet",
        ]
        res = subprocess.run(
            cmd, capture_output=True, text=True, check=False, timeout=timeout
        )
        if res.returncode == 0:
            try:
                data = json.loads(res.stdout)
                return {"status": "ok", "metadata": data}
            except ValueError:
                return {
                    "status": "error",
                    "returncode": res.returncode,
                    "stderr": "Malformed GCS describe output JSON",
                    "error_type": "parse_error",
                }

        stderr_lower = (res.stderr or "").lower()
        # Strictly classify errors:
        # 1. Any authentication, credentials, 403 Forbidden, permission, or token error is an ERROR, NEVER a 404!
        if (
            "403" in stderr_lower
            or "forbidden" in stderr_lower
            or "credentials not found" in stderr_lower
            or "authentication failed" in stderr_lower
            or "permission denied" in stderr_lower
            or "unauthenticated" in stderr_lower
            or "unauthorized" in stderr_lower
        ):
            return {
                "status": "error",
                "returncode": res.returncode,
                "stderr": res.stderr,
                "error_type": "permission_or_network",
            }

        # 2. Network, timeout, connection, DNS, or socket errors are ERRORS:
        if (
            "timeout" in stderr_lower
            or "connection refused" in stderr_lower
            or "network is unreachable" in stderr_lower
            or "timed out" in stderr_lower
        ):
            return {
                "status": "error",
                "returncode": res.returncode,
                "stderr": res.stderr,
                "error_type": "network_or_timeout",
            }

        # 3. ONLY proven 404 / NotFound for the specific object is not_found:
        # Prevent ADC "credential file not found" or other local file not found from being classified as 404
        if "credential" in stderr_lower or "credentials" in stderr_lower or ("file not found" in stderr_lower and "no such object" not in stderr_lower):
            return {
                "status": "error",
                "returncode": res.returncode,
                "stderr": res.stderr,
                "error_type": "permission_or_network",
            }
        
        if "bucket not found" in stderr_lower or "no such bucket" in stderr_lower:
            return {
                "status": "error",
                "returncode": res.returncode,
                "stderr": res.stderr,
                "error_type": "bucket_not_found",
            }

        if (
            "no such object" in stderr_lower
            or "object not found" in stderr_lower
        ):
            return {
                "status": "not_found",
                "returncode": res.returncode,
                "stderr": res.stderr,
            }

        return {
            "status": "error",
            "returncode": res.returncode,
            "stderr": res.stderr,
            "error_type": "unknown_gcs_error",
        }

    elif action == "delete":
        raise ValueError("Mutation is explicitly disabled: unsupported apply mode is rejected at entrypoint")

    elif action == "read_body":
        # Generation-pinned bounded read of object body to verify SHA-256
        require(
            generation is not None and bool(re.fullmatch(r"\d+", str(generation))),
            f"read_body requires explicit numeric generation match, got: {generation!r}",
        )
        pinned_url = f"gs://{bucket}/{key}#{generation}"
        cmd = [
            "gcloud",
            "storage",
            "cat",
            pinned_url,
            "--project",
            PROJECT,
            "--quiet",
        ]
        res = subprocess.run(
            cmd, capture_output=True, text=False, check=False, timeout=timeout
        )
        if res.returncode != 0:
            return {
                "status": "error",
                "returncode": res.returncode,
                "stderr": res.stderr.decode("utf-8", errors="replace") if res.stderr else "cat failed",
            }
        body_bytes = res.stdout
        if len(body_bytes) > 10 * 1024 * 1024:
            raise ValueError(f"Object {pinned_url} exceeds maximum bounded size for body read")
        computed_sha = hashlib.sha256(body_bytes).hexdigest()
        return {
            "status": "ok",
            "body_bytes": body_bytes,
            "size": len(body_bytes),
            "sha256": computed_sha,
        }

    raise ValueError(f"Unknown GCS runner action: {action}")


def inspect_and_validate_gcs_target(
    desc: Dict[str, Any],
    expected_item: Dict[str, Any],
    prior_receipts: Optional[Sequence[Dict[str, Any]]] = None,
    runner: Optional[Callable[..., Dict[str, Any]]] = None,
    simulation_mode: bool = False,
) -> Dict[str, Any]:
    """Validate live object identity before delete (bucket, key, generation, metageneration, MIME, size, timestamps, hash)."""
    require(expected_item.get("authority_established") is True, "explicitunverified/blocked: truly established archive/runtime authority required")
    logical_key = expected_item.get("logical_key")
    require(
        logical_key is not None and logical_key.startswith(KEY_PREFIX) and logical_key in CANONICAL_OWNED_OBJECTS,
        f"Foreign object key expected to be owned, got: {logical_key}"
    )
    bucket = expected_item.get("bucket")
    require(bucket == BUCKET, f"Foreign target bucket: {bucket} (expected {BUCKET})")
    
    key = expected_item.get("key")
    require(key is not None, "Missing target key")
    require(key == logical_to_physical_gcs_key(logical_key), f"Key does not match authoritative derivation: {key}")

    expected_size = expected_item["expected_size"]
    expected_content_type = expected_item["expected_content_type"]
    expected_sha256 = expected_item["expected_sha256"]

    status = desc.get("status")
    if status == "error":
        raise RuntimeError(
            f"GCS error describing gs://{bucket}/{key}: returncode={desc.get('returncode')}, stderr={desc.get('stderr')}"
        )

    if status == "not_found":
        # Ensure prior receipt validation has authenticated provenance
        # The script does not currently have authenticated deletion receipts, so all are unverified.
        raise ValueError(
            f"Pre-existing absence for gs://{bucket}/{key} without authoritative authenticated prior generation-bound deletion receipt"
        )

    require(status == "ok", f"Unexpected GCS describe status: {status}")
    meta = desc.get("metadata", {})
    require(isinstance(meta, dict), f"Expected metadata dict for gs://{bucket}/{key}")

    # Validate returned bucket and name match expected exactly
    live_bucket = meta.get("bucket")
    require(
        live_bucket == bucket,
        f"Foreign bucket returned: {live_bucket} (expected {bucket})"
    )
    live_name = meta.get("name")
    require(
        live_name == key,
        f"Foreign object name returned: {live_name} (expected {key})"
    )

    # Mandatory numeric generation
    generation = str(meta.get("generation", ""))
    require(
        bool(re.fullmatch(r"\d+", generation)),
        f"Missing or non-numeric generation for gs://{bucket}/{key}: {generation!r}",
    )

    # Mandatory numeric metageneration (MUST NOT default to 1 if missing!)
    raw_metagen = meta.get("metageneration")
    require(
        raw_metagen is not None and bool(re.fullmatch(r"\d+", str(raw_metagen))),
        f"Missing or invalid metageneration for gs://{bucket}/{key}: {raw_metagen!r}",
    )
    metageneration = str(raw_metagen)

    # File size
    live_size = int(meta.get("size", -1))
    require(
        live_size == expected_size,
        f"Object size mismatch for gs://{bucket}/{key}: expected {expected_size}, got {live_size}",
    )

    # Content type
    live_content_type = meta.get("contentType") or meta.get("content_type")
    require(
        live_content_type == expected_content_type,
        f"Object content-type mismatch for gs://{bucket}/{key}: expected {expected_content_type}, got {live_content_type}",
    )

    # Creation/update timestamp or stored-at time validation
    custom_meta = meta.get("metadata", {}) if isinstance(meta.get("metadata"), dict) else {}
    
    def parse_time(ts_str):
        if not ts_str: return None
        try:
            dt = datetime.datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                raise ValueError("Naive timestamp")
            return dt
        except ValueError as e:
            raise ValueError(f"Malformed or naive timestamp for gs://{bucket}/{key}: {ts_str} ({e})")

    tc_str = meta.get("timeCreated")
    up_str = meta.get("updated")
    sa_str = custom_meta.get("stored-at")
    
    require(tc_str or up_str or sa_str, f"Missing timestamp (timeCreated/updated/stored-at) for gs://{bucket}/{key}")
    
    tc = parse_time(tc_str)
    up = parse_time(up_str)
    sa = parse_time(sa_str)
    
    # Semantic chronology validation
    if tc and up:
        require(tc == up, f"Conflicting timeCreated and updated for gs://{bucket}/{key}: {tc_str} vs {up_str}")
    if sa and tc:
        require(sa <= tc, f"stored-at must not be after timeCreated for gs://{bucket}/{key}")
        
    require(tc or up or sa, f"Missing timestamp for gs://{bucket}/{key}")
    
    run_start_str = EXPECTED_RUN_BOUNDS_START
    run_end_str = EXPECTED_RUN_BOUNDS_END
    
    run_start = parse_time(run_start_str)
    run_end = parse_time(run_end_str)

    if tc:
        require(run_start <= tc <= run_end, f"timeCreated out of bounds for gs://{bucket}/{key}: {tc}")
    if up:
        require(run_start <= up <= run_end, f"updated out of bounds for gs://{bucket}/{key}: {up}")
    if sa:
        require(run_start <= sa <= run_end, f"stored-at out of bounds for gs://{bucket}/{key}: {sa}")

    # Live hash and body verification: MUST read body because Google GCS describe does not provide sha256 natively
    # Rejecting synthetic hash from metadata ensures we actually do media reads
    live_hash = None
    body_bytes = meta.get("body_bytes")
    is_synthetic = desc.get("synthetic", False)
    if body_bytes is not None:
        if isinstance(body_bytes, str):
            body_bytes = body_bytes.encode("utf-8")
        require(
            len(body_bytes) == expected_size,
            f"Body byte length mismatch for gs://{bucket}/{key}: expected {expected_size}, got {len(body_bytes)}",
        )
        computed_hash = hashlib.sha256(body_bytes).hexdigest()
        require(
            computed_hash == expected_sha256,
            f"Body digest mismatch for gs://{bucket}/{key}: expected {expected_sha256}, got {computed_hash}",
        )
        live_hash = computed_hash
    elif runner is not None:
        try:
            body_res = runner("read_body", bucket, key, generation=generation)
            if body_res.get("status") == "ok":
                if body_res.get("synthetic"):
                    is_synthetic = True
                    
                # Must check bytes/size if returned
                read_size = body_res.get("size")
                if read_size is not None:
                    require(
                        read_size == expected_size,
                        f"Media read size mismatch: expected {expected_size}, got {read_size}"
                    )
                if "body_bytes" in body_res:
                    body_b = body_res["body_bytes"]
                    if isinstance(body_b, str):
                        body_b = body_b.encode("utf-8")
                    computed = hashlib.sha256(body_b).hexdigest()
                    require(
                        computed == expected_sha256,
                        f"Media read hash mismatch: expected {expected_sha256}, got {computed}"
                    )
                    live_hash = computed
                elif simulation_mode and "sha256" in body_res:
                    # In simulation mode only, fallback to trust if body_bytes not provided but size matched
                    if read_size == expected_size:
                        is_synthetic = True
                        live_hash = body_res["sha256"]
                else:
                    raise ValueError(f"read_body runner failed to return body_bytes for {bucket}/{key}")
        except Exception as e:
            # Re-raise so failures aren't swallowed
            raise RuntimeError(f"Error reading object body: {e}")

    # Mandatory: live_hash MUST be verified! If no hash or body was provided/computed, reject!
    require(
        live_hash is not None,
        f"Missing live hash/body verification for gs://{bucket}/{key}; content hash cannot be proven",
    )
    require(
        live_hash == expected_sha256,
        f"Object SHA-256 mismatch for gs://{bucket}/{key}: expected {expected_sha256}, got {live_hash}",
    )

    return {
        "key": key,
        "bucket": bucket,
        "status": "valid",
        "generation": generation,
        "metageneration": metageneration,
        "metadata": meta,
        "verified_hash": live_hash,
        "synthetic": is_synthetic,
    }


def execute_gcs_cleanup(
    plan: Dict[str, Any],
    gcs_runner: Optional[Callable[..., Dict[str, Any]]] = None,
    prior_receipts: Optional[Sequence[Dict[str, Any]]] = None,
    simulation_mode: bool = False,
) -> Dict[str, Any]:
    mode = plan["mode"]
    if mode == "apply":
        raise ValueError("Mutation is explicitly disabled: unsupported apply mode is rejected at entrypoint")

    if not plan.get("authority_established"):
        return {
            "status": "blocked",
            "mode": mode,
            "total_targets": len(plan.get("gcs_targets", [])),
            "receipts": [{"status": "explicitunverified/blocked"}] * len(plan.get("gcs_targets", []))
        }

    runner = gcs_runner or default_gcs_runner
    targets = plan["gcs_targets"]

    # PHASE 1: PREFLIGHT ALL TARGETS BEFORE ANY MUTATION
    validated_targets = []
    for item in targets:
        bucket = item["bucket"]
        require(bucket == BUCKET, f"Target specifies foreign bucket: {bucket} (expected {BUCKET})")
        logical_key = item.get("logical_key")
        require(
            logical_key is not None and logical_key.startswith(KEY_PREFIX) and logical_key in CANONICAL_OWNED_OBJECTS,
            f"Foreign object key expected to be owned, got: {logical_key}"
        )
        key = item["key"]
        desc = runner("describe", bucket, key)
        val = inspect_and_validate_gcs_target(
            desc, item, prior_receipts=prior_receipts, runner=runner, simulation_mode=simulation_mode
        )
        validated_targets.append((item, val))

    receipts = []
    # In all modes (since mutation is disabled), record planned receipts for all preflighted targets
    for item, val in validated_targets:
        if val["status"] == "already_deleted_with_receipt":
            receipts.append(val)
        else:
            rec = {
                "key": item["key"],
                "status": "planned",
                "bucket": item["bucket"],
                "generation": val.get("generation"),
                "metageneration": val.get("metageneration"),
                "action": "dry-run (no mutation)",
            }
            if val.get("synthetic"):
                rec["synthetic"] = True
            receipts.append(rec)
    return {
        "status": "success",
        "mode": mode,
        "total_targets": len(targets),
        "receipts": receipts,
    }


def preflight_db_cleanup(
    plan: Dict[str, Any],
    db_runner: Callable[[str, List[Any]], Dict[str, Any]],
) -> Dict[str, Any]:
    """Preflight DB ownership, audit protection, and row counts before any mutation."""
    submissions = plan["db_targets"]["submissions"]

    # 1. Audit event preflight check
    review_check_sql = (
        "SELECT count(*) as cnt FROM fleet.supply_review_events "
        "WHERE submission_id = ANY($1::uuid[])"
    )
    try:
        rev_res = db_runner(review_check_sql, [submissions])
    except Exception as e:
        return {
            "status": "error",
            "concrete_blocker": f"DB transport error during review events preflight: {str(e)}",
            "plan_prepared": True,
            "receipts": [],
        }

    if rev_res.get("status") != "ok":
        return {
            "status": "error",
            "concrete_blocker": f"Database error during review events preflight: {rev_res.get('error', 'unknown error')}",
            "plan_prepared": True,
            "receipts": [],
        }

    if "count" not in rev_res or not isinstance(rev_res["count"], int) or rev_res["count"] < 0:
        return {
            "status": "blocked",
            "concrete_blocker": (
                "Review events preflight missing verified nonnegative integer 'count'. "
                "Database audit verification cannot be proven."
            ),
            "plan_prepared": True,
            "receipts": [],
        }

    rev_count = rev_res["count"]
    if rev_count > 0:
        return {
            "status": "blocked",
            "concrete_blocker": (
                f"Referential integrity blocker: {rev_count} protected audit records in "
                "fleet.supply_review_events reference owned submissions. Because audit records "
                "must never be deleted, parent submissions cannot be deleted without violating FK constraints."
            ),
            "plan_prepared": True,
            "receipts": [],
        }

    return {"status": "preflight_ok"}


def execute_db_cleanup(
    plan: Dict[str, Any],
    db_runner: Optional[Callable[[str, List[Any]], Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Execute DB cleanup only when an authorized runner is provided; enforce dry-run & guards."""
    mode = plan["mode"]
    if mode == "apply":
        raise ValueError("Mutation is explicitly disabled: unsupported apply mode is rejected at entrypoint")

    if db_runner is None:
        return {
            "status": "blocked",
            "mode": mode,
            "concrete_blocker": plan["db_blocker"],
            "plan_prepared": True,
            "statements": [
                s["table"] for s in plan["db_targets"]["guarded_statements"]
            ],
            "receipts": [],
        }

    preflight_receipts = []
    
    # 1. Run strict DB preflight using the actual runner
    preflight_res = preflight_db_cleanup(plan, db_runner)
    if preflight_res.get("status") in ("blocked", "error"):
        res_dict = {
            "status": preflight_res.get("status"),
            "mode": "dry-run",
            "concrete_blocker": preflight_res.get("concrete_blocker"),
            "plan_prepared": True,
            "receipts": preflight_receipts,
        }
        if preflight_res.get("status") == "error":
            res_dict["error"] = preflight_res.get("concrete_blocker")
        return res_dict
        
    preflight_receipts.append({"operation": "PREFLIGHT", "status": "ok"})
    
    # 2. Generic dry-run inspection (retaining the protected submission blocker, because we are not applying)
    for stmt in plan["db_targets"]["guarded_statements"]:
        table = stmt["table"]
        preflight_sql = f"SELECT count(*) as cnt FROM {table}"
        
        try:
            res = db_runner(preflight_sql, [])
        except Exception as e:
            return {
                "status": "error",
                "mode": "dry-run",
                "error": f"DB transport error on {table}: {str(e)}",
                "concrete_blocker": plan["db_blocker"],
                "plan_prepared": True,
                "receipts": preflight_receipts,
            }

        if res.get("status") != "ok":
            return {
                "status": "error",
                "mode": "dry-run",
                "error": f"DB dry-run inspection failed on {table}: {res.get('error', 'unknown database error')}",
                "concrete_blocker": plan["db_blocker"],
                "plan_prepared": True,
                "receipts": preflight_receipts,
            }
            
        if "count" not in res or not isinstance(res["count"], int) or res["count"] < 0:
            return {
                "status": "blocked",
                "mode": "dry-run",
                "concrete_blocker": f"DB dry-run inspection failed on {table}: missing or invalid nonnegative integer 'count'",
                "plan_prepared": True,
                "receipts": preflight_receipts,
            }
            
        if res["count"] == 0:
            return {
                "status": "blocked",
                "mode": "dry-run",
                "concrete_blocker": f"Zero count returned, execution contract unavailable. {plan.get('db_blocker', '')}",
                "plan_prepared": True,
                "receipts": preflight_receipts,
            }

        preflight_receipts.append(
            {
                "table": table,
                "operation": "SELECT_INSPECT",
                "inspection_result": res,
            }
        )
        
    return {
        "status": "blocked",
        "mode": "dry-run",
        "concrete_blocker": f"Generic cardinality inspection completes without authorized ownership proof. {plan.get('db_blocker', '')}",
        "plan_prepared": True,
        "receipts": preflight_receipts,
    }


def run_cleanup_pipeline(
    inventory_data: Dict[str, Any],
    mode: str = "dry-run",
    gcs_runner: Optional[Callable[..., Dict[str, Any]]] = None,
    db_runner: Optional[Callable[[str, List[Any]], Dict[str, Any]]] = None,
    source_sha: Optional[str] = None,
    run_id: Optional[int] = None,
    prior_receipts: Optional[Sequence[Dict[str, Any]]] = None,
    simulation_mode: bool = False,
) -> Dict[str, Any]:
    """Run all preflights before mutations. In apply mode, fail before mutation if DB blocked."""
    if inventory_data.get("unverified_planning_only"):
        result = {
            "status": "unverified_local_planning",
            "mode": mode,
            "applied": False,
            "error_reason": inventory_data.get("error_reason"),
            "source_sha": EXPECTED_SOURCE_SHA,
            "product_run_id": EXPECTED_PRODUCT_RUN_ID,
            "cleanup_not_performed": True,
            "preservation": {
                "preserve_failed_historical_fixtures": ["8d", "03a"],
                "preserve_audit_logs": True,
            }
        }
        if mode == "apply":
            result["status"] = "error"
            result["error"] = "Unverified local planning cannot authorize apply mode."
        return result

    plan = build_cleanup_plan(
        inventory_data, mode=mode, source_sha=source_sha, run_id=run_id
    )

    if mode == "apply":
        return {
            "status": "error",
            "mode": mode,
            "error": "Unsafe exported apply is unconditionally disabled per security review.",
            "applied": False,
            "source_sha": EXPECTED_SOURCE_SHA,
            "product_run_id": EXPECTED_PRODUCT_RUN_ID,
            "gcs_cleanup": None,
            "db_cleanup": None,
            "preservation": plan["preservation_plan"],
        }

    # Mode is dry-run: execute non-mutating inspections
    gcs_result = execute_gcs_cleanup(
        plan, gcs_runner=gcs_runner, prior_receipts=prior_receipts, simulation_mode=simulation_mode
    )
    db_result = execute_db_cleanup(plan, db_runner=db_runner)

    top_status = "dry_run_complete"
    if db_result.get("status") == "blocked":
        top_status = "dry_run_blocked"
    elif db_result.get("status") == "error":
        top_status = "dry_run_error"

    return {
        "status": top_status,
        "mode": mode,
        "applied": False,
        "source_sha": EXPECTED_SOURCE_SHA,
        "product_run_id": EXPECTED_PRODUCT_RUN_ID,
        "gcs_cleanup": gcs_result,
        "db_cleanup": db_result,
        "preservation": plan["preservation_plan"],
    }


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Owned operational fixture cleanup planner & executor."
    )
    parser.add_argument(
        "--mode",
        choices=["dry-run", "apply"],
        default="dry-run",
        help="Execution mode (default: dry-run)",
    )
    parser.add_argument(
        "--inventory",
        type=str,
        default=None,
        help="Path to exact-owned-fixture-inventory.json (dry-run only)",
    )
    parser.add_argument(
        "--artifact-dir",
        type=str,
        default=None,
        help="Path to directory containing authoritative downloaded GitHub artifact files",
    )
    parser.add_argument(
        "--source-sha",
        type=str,
        default=EXPECTED_SOURCE_SHA,
        help=f"Expected source SHA (default: {EXPECTED_SOURCE_SHA})",
    )
    parser.add_argument(
        "--run-id",
        type=int,
        default=EXPECTED_PRODUCT_RUN_ID,
        help=f"Expected product run ID (default: {EXPECTED_PRODUCT_RUN_ID})",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="Optional path to write structured cleanup receipt JSON",
    )
    parser.add_argument(
        "--offline",
        action="store_true",
        default=bool(os.environ.get("DRTS_CLEANUP_OFFLINE")),
        help="Run planner in offline mode using inventory metadata (dry-run only, zero external calls)",
    )

    args = parser.parse_args(argv)

    # Enforce CLI source/run inputs against expected constants
    if args.source_sha != EXPECTED_SOURCE_SHA:
        sys.stderr.write(
            f"CLI argument mismatch: --source-sha {args.source_sha} != expected {EXPECTED_SOURCE_SHA}\n"
        )
        return 1

    if args.run_id != EXPECTED_PRODUCT_RUN_ID:
        sys.stderr.write(
            f"CLI argument mismatch: --run-id {args.run_id} != expected {EXPECTED_PRODUCT_RUN_ID}\n"
        )
        return 1

    # Offline inventory input NEVER authorizes apply
    if args.inventory and args.mode == "apply":
        sys.stderr.write(
            "Offline inventory input is strictly prohibited in apply mode; apply requires authoritative downloaded GitHub artifact\n"
        )
        return 1

    try:
        if args.artifact_dir:
            art_dir = Path(args.artifact_dir)
            if not art_dir.is_dir():
                sys.stderr.write(f"Artifact directory not found: {args.artifact_dir}\n")
                return 1
            inventory_data = load_and_validate_authoritative_artifact(
                art_dir,
                expected_run_id=args.run_id,
                expected_source_sha=args.source_sha,
            )
        elif args.inventory:
            inventory_path = Path(args.inventory)
            if not inventory_path.is_file():
                sys.stderr.write(f"Inventory file not found: {args.inventory}\n")
                return 1
            with open(inventory_path, "r", encoding="utf-8") as f:
                inventory_data = json.load(f)
            
            inventory_data["unverified_planning_only"] = True
            inventory_data["error_reason"] = "Offline caller inventory lacks authoritative artifact/ZIP proof and trustworthy bounds."

            validate_provenance(
                inventory_data,
                run_id=args.run_id,
                source_sha=args.source_sha,
            )
            validate_inventory_items(inventory_data)
        else:
            sys.stderr.write("Must specify either --artifact-dir or --inventory\n")
            return 1

        gcs_runner = None
        if args.offline:
            require(args.mode == "dry-run", "Offline mode only supports dry-run")

            def offline_gcs_runner(action: str, bucket: str, key: str, generation=None, timeout=None):
                if action == "describe":
                    return {
                        "status": "ok",
                        "synthetic": True,
                        "metadata": {
                            "bucket": bucket,
                            "name": key,
                            "generation": "1728464600123456",
                            "metageneration": "1",
                            "size": EXPECTED_FILE_SIZE,
                            "contentType": EXPECTED_MIME,
                            "timeCreated": "2026-10-09T09:03:18.572Z",
                            "metadata": {
                                "stored-at": "2026-10-09T09:03:18.572Z",
                            },
                        },
                    }
                elif action == "read_body":
                    return {
                        "status": "ok",
                        "synthetic": True,
                        "size": EXPECTED_FILE_SIZE,
                        "sha256": EXPECTED_SHA256,
                    }
                raise ValueError("Mutation prohibited in offline mode")

            gcs_runner = offline_gcs_runner

        result = run_cleanup_pipeline(
            inventory_data=inventory_data,
            mode=args.mode,
            gcs_runner=gcs_runner,
            source_sha=args.source_sha,
            run_id=args.run_id,
            simulation_mode=args.offline,
        )

        output_str = json.dumps(result, indent=2)
        if args.output:
            out_path = Path(args.output)
            out_path.parent.mkdir(parents=True, exist_ok=True)
            with open(out_path, "w", encoding="utf-8") as f:
                f.write(output_str + "\n")
            print(f"Receipt written to {args.output}")
        else:
            print(output_str)

        # In apply mode, fail nonzero if cleanup was blocked or incomplete
        if args.mode == "apply":
            if (
                result.get("status") != "success"
                or result.get("gcs_cleanup", {}).get("status") != "success"
                or result.get("db_cleanup", {}).get("status") != "applied"
            ):
                return 1

        return 0
    except Exception as exc:
        sys.stderr.write(f"Error during fixture cleanup: {exc}\n")
        # Write partial error receipt if output requested
        if args.output:
            out_path = Path(args.output)
            out_path.parent.mkdir(parents=True, exist_ok=True)
            receipts = getattr(exc, "receipts", [])
            db_cleanup = getattr(exc, "db_result", None)
            error_receipt = {
                "status": "error",
                "mode": args.mode,
                "error": str(exc),
                "partial_receipts": receipts,
                "db_cleanup": db_cleanup,
            }
            with open(out_path, "w", encoding="utf-8") as f:
                f.write(json.dumps(error_receipt, indent=2) + "\n")
        return 2


if __name__ == "__main__":
    sys.exit(main())
