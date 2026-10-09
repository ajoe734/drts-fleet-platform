#!/usr/bin/env python3
"""Fail-closed cleanup planner and executor for owned operational fixtures.

This script plans and executes generation-bound GCS deletion for the exact
eight 327-byte PDF objects created during authorized product run 37906298090,
generates narrow guarded database deletion statements for owned submission
and document records, and strictly preserves business audit/cancellation
records, seeded demo entities, and historical failed fixtures (8d / 03a).

Safety & Governance Constraints:
- Default mode is 'dry-run'.
- Fixed project: drts-dev-devcc-20260825, region: us-central1.
- Fixed bucket: drts-dev-devcc-20260825-document-artifacts.
- Strict provenance binding: run 37906298090, source 4a166f3ed2a7000061acc737ee475ae3c47dca56,
  workflow definition 9a1b6466a8b15d7d328e9ceba33ba5dc92f7fa9c, artifact 11606165993.
- Authoritative artifact retrieval & verification: binds artifact metadata, digest,
  operational report statistics (16 passed / 0 failed / 0 skipped), and evidence records.
- Physical key mapping: derives physical GCS object keys under
  'document-artifacts/fleet-upload-content/<encoded-subject>' per the immutable
  GcsDocumentArtifactStoreAdapter contract, while preserving exact logical ownership keys.
- GCS describe errors distinguish proven 404 from 403 / network / timeout errors (fail-closed).
- GCS deletion requires exact generation match, metageneration, MIME, size, timestamps,
  and content hash integrity validation before deletion, plus subsequent proven 404 absent read.
- Non-mutating preflights occur before any mutation; all required GCS and DB preflights
  must pass before any GCS or DB mutation is attempted.
- Database mutations require narrow guarded transaction (BEGIN / COMMIT / ROLLBACK);
  never deletes fleet.supply_review_events audit records. Protected referencing records
  block deletion of parent submissions.
- Zero socket or network calls on VM (stdlib only; external boundary mocked in unit tests).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
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
        "document_id": "43e91900-b03d-4319-8bd1-25d438372f4d",
        "submission_id": "8b7b0b8a-bc5a-48f3-b576-af201e6ba074",
        "document_type": "professional_driver_license",
    },
    "fleet-partner/fleet-demo-001/supply-submissions/8b7b0b8a-bc5a-48f3-b576-af201e6ba074/8ad02a30-c584-4deb-b2c8-5883f9a5345a-harmless-upload.pdf": {
        "document_id": "dc3aaed4-7f9c-4e61-a532-c6acd49cdf59",
        "submission_id": "8b7b0b8a-bc5a-48f3-b576-af201e6ba074",
        "document_type": "taxi_driver_registration",
    },
    "fleet-partner/fleet-demo-001/supply-submissions/deeed4cd-ede0-4daf-a70f-4d0e900987b9/f88f9320-7c81-4df9-9abd-d7ced9c0c50a-harmless-upload.pdf": {
        "document_id": "f26201ec-7e67-4866-94fc-8a5bfd5ecbca",
        "submission_id": "deeed4cd-ede0-4daf-a70f-4d0e900987b9",
        "document_type": "professional_driver_license",
    },
    "fleet-partner/fleet-demo-001/supply-submissions/deeed4cd-ede0-4daf-a70f-4d0e900987b9/195565d9-9f64-4a29-8446-f93bb0fe252b-harmless-upload.pdf": {
        "document_id": "9e863fbe-0ba0-4b48-b2ac-a88c8d8e8a47",
        "submission_id": "deeed4cd-ede0-4daf-a70f-4d0e900987b9",
        "document_type": "taxi_driver_registration",
    },
    "fleet-partner/fleet-demo-001/supply-submissions/f735275c-151d-4f25-a9f0-174f2602f919/e6a71c74-a036-4ea9-a025-0386d9ed1861-harmless-upload.pdf": {
        "document_id": "4f93a852-9031-44e2-ac06-3c808c9e84cb",
        "submission_id": "f735275c-151d-4f25-a9f0-174f2602f919",
        "document_type": "professional_driver_license",
    },
    "fleet-partner/fleet-demo-001/supply-submissions/f735275c-151d-4f25-a9f0-174f2602f919/a627cd09-ebc8-4024-88ba-91a4f5489574-harmless-upload.pdf": {
        "document_id": "d2c8b8d5-c5ac-4bd5-a5ef-94a413ac5046",
        "submission_id": "f735275c-151d-4f25-a9f0-174f2602f919",
        "document_type": "taxi_driver_registration",
    },
    "fleet-partner/fleet-demo-001/supply-submissions/93430506-d016-4b07-897f-ab9b4d3530df/3bbb4f20-0cd5-4676-9ae1-e428ce26461b-harmless-upload.pdf": {
        "document_id": "279550a2-3eac-4c5e-b315-cb86308d9ae7",
        "submission_id": "93430506-d016-4b07-897f-ab9b4d3530df",
        "document_type": "professional_driver_license",
    },
    "fleet-partner/fleet-demo-001/supply-submissions/93430506-d016-4b07-897f-ab9b4d3530df/024c77c7-8d95-4c29-8fd1-51dc0a89f8ba-harmless-upload.pdf": {
        "document_id": "c5e2a567-df7a-42dc-8aa6-481e5eb9e823",
        "submission_id": "93430506-d016-4b07-897f-ab9b4d3530df",
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
    "Furthermore, the GitHub Actions deployer SA operates under a strict runtime identity split and lacks "
    "direct private VPC connectivity to Cloud SQL or DATABASE_URL secret export. "
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
            canonical["document_id"] == doc_id,
            f"Document ID mismatch for key {key}: expected {canonical['document_id']}, got {doc_id}",
        )
        require(
            canonical["submission_id"] == sub_id,
            f"Submission ID mismatch for key {key}: expected {canonical['submission_id']}, got {sub_id}",
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
                "document_id": doc_id,
                "submission_id": sub_id,
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
    require(
        len(zip_candidates) > 0,
        "No archive zip found for hashing. Tampered extracted evidence accepted without archive hashing/run/jobs proof is rejected."
    )
    zip_path = zip_candidates[0]
    zip_hash = hashlib.sha256(zip_path.read_bytes()).hexdigest()
    expected_raw_hash = EXPECTED_ARTIFACT_DIGEST.replace("sha256:", "") if "sha256:" in EXPECTED_ARTIFACT_DIGEST else EXPECTED_ARTIFACT_DIGEST
    require(
        zip_hash == expected_raw_hash,
        f"Archive hash mismatch: expected {expected_raw_hash}, got {zip_hash}"
    )

    # 2. Locate report.json and operational-browser-evidence.json
    report_candidates = [
        artifact_dir / "report.json",
        artifact_dir / "operational-browser" / "report.json",
        artifact_dir / "payload" / "report.json",
        artifact_dir / "payload" / "operational-browser" / "report.json",
    ]
    report_path = next((p for p in report_candidates if p.is_file()), None)
    if report_path is None:
        matches = sorted(artifact_dir.glob("**/report.json"))
        if matches:
            report_path = matches[0]
    require(report_path is not None, f"report.json not found under {artifact_dir}")

    evidence_candidates = [
        artifact_dir / "operational-browser-evidence.json",
        artifact_dir / "operational-browser" / "operational-browser-evidence.json",
        artifact_dir / "payload" / "operational-browser-evidence.json",
        artifact_dir / "payload" / "operational-browser" / "operational-browser-evidence.json",
    ]
    evidence_path = next((p for p in evidence_candidates if p.is_file()), None)
    if evidence_path is None:
        matches = sorted(artifact_dir.glob("**/operational-browser-evidence.json"))
        if matches:
            evidence_path = matches[0]
    require(evidence_path is not None, f"operational-browser-evidence.json not found under {artifact_dir}")

    # 3. Validate report.json
    with open(report_path, "r", encoding="utf-8") as f:
        report_data = json.load(f)

    cfg = report_data.get("config", {})
    cfg_meta = cfg.get("metadata", {})
    ci_meta = cfg_meta.get("ci", {})
    git_meta = cfg_meta.get("gitCommit", {})

    require(
        ci_meta.get("commitHash") == expected_workflow_def_sha,
        f"Report workflow definition SHA mismatch: {ci_meta.get('commitHash')}",
    )
    require(
        git_meta.get("hash") == expected_source_sha,
        f"Report git commit SHA mismatch: {git_meta.get('hash')}",
    )
    require(
        str(expected_run_id) in str(ci_meta.get("buildHref", "")),
        f"Report buildHref does not reference run {expected_run_id}",
    )

    # Mandatory statistics check (stats cannot be missing or defaulted)
    stats = report_data.get("stats")
    require(
        isinstance(stats, dict) and len(stats) > 0,
        f"Report statistics missing in report.json: {stats}",
    )
    require(stats.get("expected") == 16, f"Expected 16 tests in report, got {stats.get('expected')}")
    require(stats.get("unexpected") == 0, f"Unexpected failures in report: {stats.get('unexpected')}")
    require(stats.get("skipped") == 0, f"Skipped tests in report: {stats.get('skipped')}")
    require(stats.get("flaky") == 0, f"Flaky tests in report: {stats.get('flaky')}")

    # 4. Validate evidence and extract storage documents + mutations
    with open(evidence_path, "r", encoding="utf-8") as f:
        evidence_data = json.load(f)

    require(
        evidence_data.get("candidateSha") == expected_source_sha,
        f"Evidence candidateSha mismatch: {evidence_data.get('candidateSha')}",
    )

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
            rec_at = entry.get("recordedAt")
            require(
                rec_at is not None and isinstance(rec_at, str) and "2026-" in rec_at,
                f"Invalid or stale evidence recordedAt timestamp: {rec_at}",
            )
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
    gcs_targets = []
    for doc in validated_docs:
        logical_key = doc["object_key"]
        physical_key = logical_to_physical_gcs_key(logical_key)
        gcs_targets.append(
            {
                "bucket": BUCKET,
                "key": physical_key,
                "physical_key": physical_key,
                "logical_key": logical_key,
                "expected_size": doc["file_size"],
                "expected_sha256": doc["sha256"],
                "expected_content_type": doc["content_type"],
                "document_id": doc["document_id"],
                "submission_id": doc["submission_id"],
            }
        )

    # Note: fleet.supply_review_events is NEVER deleted.
    # It is an audit record table referenced by foreign key constraints.
    db_targets = {
        "documents": [doc["document_id"] for doc in validated_docs],
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
                    [doc["document_id"] for doc in validated_docs],
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
                    [doc["document_id"] for doc in validated_docs],
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
                    "SELECT draft_id FROM fleet.driver_supply_drafts "
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
                    "SELECT draft_id FROM fleet.vehicle_supply_drafts "
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
                    [doc["document_id"] for doc in validated_docs],
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
        
        if (
            "no such object" in stderr_lower
            or "httperror 404" in stderr_lower
            or "httpstatus 404" in stderr_lower
            or "status code 404" in stderr_lower
            or "notfoundexception: 404" in stderr_lower
            or (res.returncode == 1 and "not found" in stderr_lower and "bucket" not in stderr_lower)
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
        require(
            generation is not None and bool(re.fullmatch(r"\d+", str(generation))),
            f"Delete requires explicit numeric generation match, got: {generation!r}",
        )
        cmd = [
            "gcloud",
            "storage",
            "rm",
            f"--if-generation-match={generation}",
            gs_url,
            "--project",
            PROJECT,
            "--quiet",
        ]
        res = subprocess.run(
            cmd, capture_output=True, text=True, check=False, timeout=timeout
        )
        if res.returncode != 0:
            return {
                "status": "error",
                "returncode": res.returncode,
                "stderr": res.stderr or "gcloud storage rm failed",
            }
        return {"status": "ok", "deleted": True}

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
) -> Dict[str, Any]:
    """Validate live object identity before delete (bucket, key, generation, metageneration, MIME, size, timestamps, hash)."""
    bucket = expected_item["bucket"]
    key = expected_item["key"]
    expected_size = expected_item["expected_size"]
    expected_content_type = expected_item["expected_content_type"]
    expected_sha256 = expected_item["expected_sha256"]

    status = desc.get("status")
    if status == "error":
        raise RuntimeError(
            f"GCS error describing gs://{bucket}/{key}: returncode={desc.get('returncode')}, stderr={desc.get('stderr')}"
        )

    if status == "not_found":
        # Check if an authoritative prior generation-bound receipt exists for this object
        valid_prior_receipt = None
        if prior_receipts:
            receipt_list = (
                prior_receipts.values()
                if isinstance(prior_receipts, dict)
                else prior_receipts
            )
            for r in receipt_list:
                if not isinstance(r, dict):
                    continue
                # Prior receipt MUST match exact key, exact bucket, deleted status, numeric generation, and verified_absent True!
                if (
                    r.get("key") == key
                    and r.get("bucket") == bucket
                    and r.get("status") == "deleted"
                    and r.get("generation") is not None
                    and bool(re.fullmatch(r"\d+", str(r.get("generation"))))
                    and r.get("verified_absent") is True
                ):
                    valid_prior_receipt = r
                    break

        if valid_prior_receipt is not None:
            return {
                "key": key,
                "bucket": bucket,
                "status": "already_deleted_with_receipt",
                "generation": str(valid_prior_receipt["generation"]),
                "verified_absent": True,
                "prior_receipt_verified": True,
            }

        # Pre-existing absence without valid prior generation-bound receipt is an unverified failure
        raise ValueError(
            f"Pre-existing absence for gs://{bucket}/{key} without authoritative prior generation-bound deletion receipt"
        )

    require(status == "ok", f"Unexpected GCS describe status: {status}")
    meta = desc.get("metadata", {})
    require(isinstance(meta, dict), f"Expected metadata dict for gs://{bucket}/{key}")

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

    # Custom metadata dict
    custom_meta = meta.get("metadata", {}) if isinstance(meta.get("metadata"), dict) else {}

    # Live hash and body verification: MUST read body because Google GCS describe does not provide sha256 natively
    # Rejecting synthetic hash from metadata ensures we actually do media reads
    live_hash = None
    body_bytes = meta.get("body_bytes")
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
            if body_res.get("status") == "ok" and "sha256" in body_res:
                live_hash = body_res["sha256"]
        except Exception:
            pass

    # Creation/update timestamp or stored-at time validation
    custom_meta = meta.get("metadata", {}) if isinstance(meta.get("metadata"), dict) else {}
    time_created = (
        meta.get("timeCreated")
        or meta.get("updated")
        or custom_meta.get("stored-at")
    )
    require(
        time_created is not None and isinstance(time_created, str) and len(time_created) > 0,
        f"Missing timestamp (timeCreated/updated/stored-at) for gs://{bucket}/{key}",
    )
    require(
        "2026-" in time_created,
        f"Stale or invalid object timestamp for gs://{bucket}/{key}: {time_created}",
    )

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
    }


def execute_gcs_cleanup(
    plan: Dict[str, Any],
    gcs_runner: Optional[Callable[..., Dict[str, Any]]] = None,
    prior_receipts: Optional[Sequence[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    runner = gcs_runner or default_gcs_runner
    mode = plan["mode"]
    targets = plan["gcs_targets"]

    # PHASE 1: PREFLIGHT ALL TARGETS BEFORE ANY MUTATION
    validated_targets = []
    for item in targets:
        bucket = item["bucket"]
        key = item["key"]
        desc = runner("describe", bucket, key)
        val = inspect_and_validate_gcs_target(
            desc, item, prior_receipts=prior_receipts, runner=runner
        )
        validated_targets.append((item, val))

    receipts = []
    # If mode is dry-run, record planned receipts for all preflighted targets
    if mode == "dry-run":
        for item, val in validated_targets:
            if val["status"] == "already_deleted_with_receipt":
                receipts.append(val)
            else:
                receipts.append(
                    {
                        "key": item["key"],
                        "status": "planned",
                        "bucket": item["bucket"],
                        "generation": val["generation"],
                        "metageneration": val["metageneration"],
                        "action": "dry-run (no mutation)",
                    }
                )
        return {
            "status": "success",
            "mode": mode,
            "total_targets": len(targets),
            "receipts": receipts,
        }

    # PHASE 2: APPLY MODE (All targets preflighted and valid)
    for idx, (item, val) in enumerate(validated_targets):
        bucket = item["bucket"]
        key = item["key"]
        if val["status"] == "already_deleted_with_receipt":
            receipts.append(val)
            continue

        live_generation = val["generation"]
        try:
            del_res = runner("delete", bucket, key, generation=live_generation)
            require(
                del_res.get("status") == "ok",
                f"GCS deletion failed for gs://{bucket}/{key} with generation {live_generation}: {del_res.get('stderr')}",
            )
            # Subsequent absent read
            post_desc = runner("describe", bucket, key)
            post_status = post_desc.get("status")
            if post_status == "ok":
                raise RuntimeError(
                    f"Object gs://{bucket}/{key} still present after generation-matched delete!"
                )
            if post_status == "error":
                raise RuntimeError(
                    f"Unable to verify absence of gs://{bucket}/{key} after delete: {post_desc.get('stderr')}"
                )
            require(
                post_status == "not_found",
                f"Expected proven not_found after delete for gs://{bucket}/{key}, got: {post_status}",
            )
            receipts.append(
                {
                    "key": key,
                    "status": "deleted",
                    "bucket": bucket,
                    "generation": live_generation,
                    "verified_absent": True,
                }
            )
        except Exception as exc:
            receipts.append(
                {
                    "key": key,
                    "status": "failed",
                    "bucket": bucket,
                    "generation": live_generation,
                    "error": str(exc),
                }
            )
            # Record remaining targets as skipped due to failure
            for remaining_item, remaining_val in validated_targets[idx + 1 :]:
                receipts.append(
                    {
                        "key": remaining_item["key"],
                        "status": "skipped_due_to_prior_failure",
                        "bucket": remaining_item["bucket"],
                    }
                )
            err = RuntimeError(f"GCS execution failure: {exc}")
            err.receipts = receipts  # type: ignore
            raise err

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
    rev_res = db_runner(review_check_sql, [submissions])
    if rev_res.get("status") != "ok":
        raise RuntimeError(f"Database error during review events preflight: {rev_res}")

    if "count" not in rev_res or not isinstance(rev_res["count"], int):
        return {
            "status": "blocked",
            "concrete_blocker": (
                "Review events preflight missing verified integer 'count'. "
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

    # Dry-run mode: NEVER mutate database!
    if mode == "dry-run":
        preflight_receipts = []
        for stmt in plan["db_targets"]["guarded_statements"]:
            table = stmt["table"]
            preflight_sql = f"SELECT count(*) as cnt FROM {table}"
            res = db_runner(preflight_sql, [])
            if res.get("status") != "ok":
                return {
                    "status": "blocked",
                    "mode": "dry-run",
                    "concrete_blocker": f"DB dry-run inspection failed on {table}: {res.get('error', 'unknown database error')}",
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
            "status": "dry_run_inspected",
            "mode": "dry-run",
            "concrete_blocker": None,
            "plan_prepared": True,
            "receipts": preflight_receipts,
        }

    # Apply mode:
    # 1. Audit event preflight
    preflight = preflight_db_cleanup(plan, db_runner)
    if preflight.get("status") != "preflight_ok":
        return preflight

    # 2. Guarded transaction with BEGIN / COMMIT / ROLLBACK
    begin_res = db_runner("BEGIN", [])
    require(begin_res.get("status") == "ok", f"DB BEGIN failed: {begin_res}")

    db_receipts = []
    try:
        for stmt in plan["db_targets"]["guarded_statements"]:
            res = db_runner(stmt["sql"], stmt["params"])
            require(
                res.get("status") == "ok",
                f"DB execution error on table {stmt['table']}: {res}",
            )
            
            if "expected_count" in stmt:
                cnt = res.get("count", 0)
                expected = stmt["expected_count"]
                require(
                    cnt == expected,
                    f"DB postflight mismatch on {stmt['table']}: expected {expected}, got {cnt}",
                )
                db_receipts.append(
                    {
                        "table": stmt["table"],
                        "operation": stmt["operation"],
                        "count": cnt,
                        "expected_count": expected,
                    }
                )
            else:
                rows_affected = res.get("rows_affected", 0)
                expected_rows = stmt["expected_rows"]
                if stmt["operation"] == "DELETE":
                    require(
                        rows_affected > 0,
                        f"DB deletion affected 0 rows on {stmt['table']}; zero rows affected rejected",
                    )
                require(
                    rows_affected == expected_rows,
                    f"DB row count mismatch on {stmt['table']}: expected {expected_rows}, got {rows_affected}",
                )
                db_receipts.append(
                    {
                        "table": stmt["table"],
                        "operation": stmt["operation"],
                        "rows_affected": rows_affected,
                        "expected_rows": expected_rows,
                    }
                )
        commit_res = db_runner("COMMIT", [])
        require(commit_res.get("status") == "ok", f"DB COMMIT failed: {commit_res}")
    except Exception as exc:
        try:
            db_runner("ROLLBACK", [])
        except Exception:
            pass
        raise exc

    return {
        "status": "applied",
        "mode": "apply",
        "concrete_blocker": None,
        "plan_prepared": True,
        "receipts": db_receipts,
    }


def run_cleanup_pipeline(
    inventory_data: Dict[str, Any],
    mode: str = "dry-run",
    gcs_runner: Optional[Callable[..., Dict[str, Any]]] = None,
    db_runner: Optional[Callable[[str, List[Any]], Dict[str, Any]]] = None,
    source_sha: Optional[str] = None,
    run_id: Optional[int] = None,
    prior_receipts: Optional[Sequence[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Run all preflights before mutations. In apply mode, fail before mutation if DB blocked."""
    plan = build_cleanup_plan(
        inventory_data, mode=mode, source_sha=source_sha, run_id=run_id
    )

    if mode == "apply":
        if db_runner is None:
            # DB cleanup is blocked/unavailable. Halt before any GCS call or mutation!
            db_blocked = execute_db_cleanup(plan, db_runner=None)
            return {
                "status": "blocked",
                "mode": mode,
                "applied": False,
                "source_sha": EXPECTED_SOURCE_SHA,
                "product_run_id": EXPECTED_PRODUCT_RUN_ID,
                "gcs_cleanup": {
                    "status": "skipped_due_to_db_blocker",
                    "total_targets": len(plan["gcs_targets"]),
                    "receipts": [],
                },
                "db_cleanup": db_blocked,
                "preservation": plan["preservation_plan"],
            }

        # DB runner is present: non-mutating preflights for BOTH GCS and DB before ANY mutation!
        # First: Preflight GCS targets (zero mutation)
        gcs_runner_fn = gcs_runner or default_gcs_runner
        for target in plan["gcs_targets"]:
            desc = gcs_runner_fn("describe", target["bucket"], target["key"])
            inspect_and_validate_gcs_target(
                desc, target, prior_receipts=prior_receipts, runner=gcs_runner_fn
            )

        # DB runner is present: execute DB preflight
        db_preflight = preflight_db_cleanup(plan, db_runner=db_runner)
        if db_preflight.get("status") != "preflight_ok":
            return {
                "status": "blocked",
                "mode": mode,
                "applied": False,
                "source_sha": EXPECTED_SOURCE_SHA,
                "product_run_id": EXPECTED_PRODUCT_RUN_ID,
                "gcs_cleanup": {
                    "status": "skipped_due_to_db_blocker",
                    "total_targets": len(plan["gcs_targets"]),
                    "receipts": [],
                },
                "db_cleanup": db_preflight,
                "preservation": plan["preservation_plan"],
            }

        # ALL preflights passed! Now execute mutations:
        # Phase A: execute DB cleanup within guarded transaction
        db_result = execute_db_cleanup(plan, db_runner=db_runner)
        if db_result.get("status") != "applied":
            return {
                "status": "blocked",
                "mode": mode,
                "applied": False,
                "source_sha": EXPECTED_SOURCE_SHA,
                "product_run_id": EXPECTED_PRODUCT_RUN_ID,
                "gcs_cleanup": {
                    "status": "skipped_due_to_db_blocker",
                    "total_targets": len(plan["gcs_targets"]),
                    "receipts": [],
                },
                "db_cleanup": db_result,
                "preservation": plan["preservation_plan"],
            }

        # Phase B: execute GCS cleanup
        try:
            gcs_result = execute_gcs_cleanup(
                plan, gcs_runner=gcs_runner, prior_receipts=prior_receipts
            )
        except Exception as exc:
            # Preserve DB cleanup receipts if GCS fails
            exc.db_result = db_result
            raise
        return {
            "status": "success",
            "mode": mode,
            "applied": True,
            "source_sha": EXPECTED_SOURCE_SHA,
            "product_run_id": EXPECTED_PRODUCT_RUN_ID,
            "gcs_cleanup": gcs_result,
            "db_cleanup": db_result,
            "preservation": plan["preservation_plan"],
        }

    # Mode is dry-run: execute non-mutating inspections
    gcs_result = execute_gcs_cleanup(
        plan, gcs_runner=gcs_runner, prior_receipts=prior_receipts
    )
    db_result = execute_db_cleanup(plan, db_runner=db_runner)

    return {
        "status": "dry_run_complete",
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
                        "metadata": {
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
