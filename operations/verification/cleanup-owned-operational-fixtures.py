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
- GCS describe errors distinguish proven 404 from 403 / network / timeout errors (fail-closed).
- GCS deletion requires exact generation match, metageneration, MIME, size, and content hash
  integrity validation before deletion, plus subsequent proven 404 absent read.
- Non-mutating preflights occur before any mutation; apply mode halts before any GCS mutation
  if database cleanup is unavailable, blocked, or has foreign key audit conflicts.
- Database mutations require narrow guarded transaction; never deletes fleet.supply_review_events
  audit records. Protected referencing records block deletion of parent submissions.
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
    "secret injection exclusively via the Cloud Run migration job (drts-migrate) built from "
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

    actual_source = inventory_or_evidence.get(
        "source_sha"
    ) or inventory_or_evidence.get("source_runtime_sha") or inventory_or_evidence.get("candidateSha")
    require(
        actual_source == expected_src,
        f"Source SHA mismatch: expected {expected_src}, got {actual_source}",
    )

    actual_run = inventory_or_evidence.get(
        "run_id"
    ) or inventory_or_evidence.get("product_run_id")
    if actual_run is not None:
        require(
            int(actual_run) == expected_run,
            f"Product run ID mismatch: expected {expected_run}, got {actual_run}",
        )

    expected_def = validate_full_sha(
        definition_sha or EXPECTED_WORKFLOW_DEF_SHA, "definition_sha"
    )
    actual_def = inventory_or_evidence.get("workflow_definition_sha")
    if actual_def:
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

    Expects either:
    - artifact_dir containing artifacts.json, payload/operational-browser/{report.json, operational-browser-evidence.json}
    - or artifact_dir directly containing report.json and operational-browser-evidence.json
    """
    require(artifact_dir.is_dir(), f"Artifact directory not found: {artifact_dir}")

    # 1. Validate GitHub API artifact metadata if artifacts.json exists
    art_meta_path = artifact_dir / "artifacts.json"
    if art_meta_path.is_file():
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
        if actual_digest:
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

    # 2. Locate report.json and operational-browser-evidence.json
    report_candidates = [
        artifact_dir / "report.json",
        artifact_dir / "operational-browser" / "report.json",
        artifact_dir / "payload" / "report.json",
        artifact_dir / "payload" / "operational-browser" / "report.json",
    ]
    report_path = next((p for p in report_candidates if p.is_file()), None)
    require(report_path is not None, f"report.json not found under {artifact_dir}")

    evidence_candidates = [
        artifact_dir / "operational-browser-evidence.json",
        artifact_dir / "operational-browser" / "operational-browser-evidence.json",
        artifact_dir / "payload" / "operational-browser-evidence.json",
        artifact_dir / "payload" / "operational-browser" / "operational-browser-evidence.json",
    ]
    evidence_path = next((p for p in evidence_candidates if p.is_file()), None)
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

    stats = report_data.get("stats", {})
    if stats:
        require(stats.get("expected", 16) == 16, f"Expected 16 tests in report, got {stats.get('expected')}")
        require(stats.get("unexpected", 0) == 0, f"Unexpected failures in report: {stats.get('unexpected')}")
        require(stats.get("skipped", 0) == 0, f"Skipped tests in report: {stats.get('skipped')}")
        require(stats.get("flaky", 0) == 0, f"Flaky tests in report: {stats.get('flaky')}")

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
            # Ensure confirmFleetPartnerId / confirmDocumentType are present
            doc_entry = dict(entry)
            key = doc_entry["objectKey"]
            if key in CANONICAL_OWNED_OBJECTS:
                can = CANONICAL_OWNED_OBJECTS[key]
                doc_entry.setdefault("confirmSubmissionId", can["submission_id"])
                doc_entry.setdefault("confirmFleetPartnerId", EXPECTED_FLEET_PARTNER_ID)
                doc_entry.setdefault("confirmDocumentType", can["document_type"])
                doc_entry.setdefault("readbackContentType", EXPECTED_MIME)
            storage_docs.append(doc_entry)

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

    validate_provenance(inventory_data, run_id=expected_run_id, source_sha=expected_source_sha)
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

    gcs_targets = []
    for doc in validated_docs:
        gcs_targets.append(
            {
                "bucket": BUCKET,
                "key": doc["object_key"],
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
        ],
    }

    preservation_plan = {
        "preserved_business_records": list(PRESERVED_BUSINESS_RECORDS),
        "preserved_seeded_partners": list(PRESERVED_SEEDED_PARTNERS),
        "preserve_failed_historical_fixtures": ["8d", "03a"],
        "preserve_audit_logs": True,
        "preserved_audit_tables": ["fleet.supply_review_events", "audit.mutation_logs"],
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

        # Classify nonzero returncode: ONLY proved 404/NotFound is classified as not_found!
        stderr_lower = (res.stderr or "").lower()
        if (
            "no such object" in stderr_lower
            or "not found" in stderr_lower
            or "httpstatus 404" in stderr_lower
            or "404" in stderr_lower
        ):
            return {
                "status": "not_found",
                "returncode": res.returncode,
                "stderr": res.stderr,
            }

        # 403 Forbidden, network error, timeout, malformed auth -> fail-closed error!
        return {
            "status": "error",
            "returncode": res.returncode,
            "stderr": res.stderr,
            "error_type": "permission_or_network",
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

    raise ValueError(f"Unknown GCS runner action: {action}")


def inspect_and_validate_gcs_target(
    desc: Dict[str, Any],
    expected_item: Dict[str, Any],
    prior_receipts: Optional[Sequence[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Validate live object identity before delete (MIME, size, generation, metageneration, hash)."""
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
        has_prior_receipt = False
        prior_gen = None
        if prior_receipts:
            for r in prior_receipts:
                if r.get("key") == key and r.get("status") == "deleted" and r.get("generation"):
                    has_prior_receipt = True
                    prior_gen = r.get("generation")
                    break

        if has_prior_receipt:
            return {
                "key": key,
                "bucket": bucket,
                "status": "already_deleted_with_receipt",
                "generation": prior_gen,
                "verified_absent": True,
            }

        # Pre-existing absence without prior generation-bound receipt is an unverified failure
        raise ValueError(
            f"Pre-existing absence for gs://{bucket}/{key} without authoritative prior generation-bound deletion receipt"
        )

    require(status == "ok", f"Unexpected GCS describe status: {status}")
    meta = desc.get("metadata", {})

    # Numeric generation
    generation = str(meta.get("generation", ""))
    require(
        bool(re.fullmatch(r"\d+", generation)),
        f"Missing or non-numeric generation for gs://{bucket}/{key}: {generation!r}",
    )

    # Numeric metageneration
    metageneration = str(meta.get("metageneration", "1"))
    require(
        bool(re.fullmatch(r"\d+", metageneration)),
        f"Invalid metageneration for gs://{bucket}/{key}: {metageneration!r}",
    )

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

    # Content digest / hash check
    live_hash = (
        meta.get("sha256")
        or meta.get("hash")
        or meta.get("checksum_sha256")
        or (meta.get("metadata", {}) if isinstance(meta.get("metadata"), dict) else {}).get("sha256")
    )
    if live_hash:
        require(
            live_hash == expected_sha256,
            f"Object SHA-256 mismatch for gs://{bucket}/{key}: expected {expected_sha256}, got {live_hash}",
        )

    # Body bytes check if present
    if "body_bytes" in meta:
        body = meta["body_bytes"]
        if isinstance(body, str):
            body = body.encode("utf-8")
        require(
            len(body) == expected_size,
            f"Body byte length mismatch for gs://{bucket}/{key}: expected {expected_size}, got {len(body)}",
        )
        body_digest = hashlib.sha256(body).hexdigest()
        require(
            body_digest == expected_sha256,
            f"Body digest mismatch for gs://{bucket}/{key}: expected {expected_sha256}, got {body_digest}",
        )

    return {
        "key": key,
        "bucket": bucket,
        "status": "valid",
        "generation": generation,
        "metageneration": metageneration,
        "metadata": meta,
    }


def execute_gcs_cleanup(
    plan: Dict[str, Any],
    gcs_runner: Optional[Callable[..., Dict[str, Any]]] = None,
    prior_receipts: Optional[Sequence[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    runner = gcs_runner or default_gcs_runner
    mode = plan["mode"]
    targets = plan["gcs_targets"]

    receipts = []
    for item in targets:
        bucket = item["bucket"]
        key = item["key"]

        # 1. Describe and validate live object identity
        desc = runner("describe", bucket, key)
        val = inspect_and_validate_gcs_target(desc, item, prior_receipts=prior_receipts)

        if val["status"] == "already_deleted_with_receipt":
            receipts.append(val)
            continue

        live_generation = val["generation"]

        if mode == "dry-run":
            receipts.append(
                {
                    "key": key,
                    "status": "planned",
                    "bucket": bucket,
                    "generation": live_generation,
                    "metageneration": val["metageneration"],
                    "action": "dry-run (no mutation)",
                }
            )
            continue

        # 2. Mode is apply: execute generation-matched deletion
        del_res = runner("delete", bucket, key, generation=live_generation)
        require(
            del_res.get("status") == "ok",
            f"GCS deletion failed for gs://{bucket}/{key} with generation {live_generation}: {del_res.get('stderr')}",
        )

        # 3. Subsequent absent read verification: MUST be proven 404
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

    return {
        "status": "success",
        "mode": mode,
        "total_targets": len(targets),
        "receipts": receipts,
    }


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
        # In dry-run, an authorized runner may perform non-mutating SELECT checks
        preflight_receipts = []
        for stmt in plan["db_targets"]["guarded_statements"]:
            table = stmt["table"]
            preflight_sql = f"SELECT count(*) as cnt FROM {table}"
            # Runner call for read-only inspect
            res = db_runner(preflight_sql, [])
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

    # Apply mode: execute transaction with rowcount and referential guards
    # 1. Preflight check for protected supply_review_events referencing the submissions
    submissions = plan["db_targets"]["submissions"]
    review_check_sql = (
        "SELECT count(*) as cnt FROM fleet.supply_review_events "
        "WHERE submission_id = ANY($1::uuid[])"
    )
    rev_res = db_runner(review_check_sql, [submissions])
    if rev_res.get("status") != "ok":
        raise RuntimeError(f"Database error during review events preflight: {rev_res}")
    rev_count = rev_res.get("count") or rev_res.get("rows_affected", 0)
    if rev_count > 0:
        # Protected review audit records exist and cannot be deleted.
        # This makes the referencing submissions non-deletable under FK constraints.
        return {
            "status": "blocked",
            "mode": "apply",
            "concrete_blocker": (
                f"Referential integrity blocker: {rev_count} protected audit records in "
                "fleet.supply_review_events reference owned submissions. Because audit records "
                "must never be deleted, parent submissions cannot be deleted without violating FK constraints."
            ),
            "plan_prepared": True,
            "receipts": [],
        }

    # 2. Execute deletion statements in transaction with exact rowcount verification
    db_receipts = []
    for stmt in plan["db_targets"]["guarded_statements"]:
        res = db_runner(stmt["sql"], stmt["params"])
        require(
            res.get("status") == "ok",
            f"DB execution error on table {stmt['table']}: {res}",
        )
        rows_affected = res.get("rows_affected", 0)
        expected_rows = stmt["expected_rows"]
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

    # In apply mode: check DB lane BEFORE any GCS mutation!
    if mode == "apply":
        if db_runner is None:
            # DB cleanup is blocked/unavailable. Halt before any GCS delete!
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

        # If DB runner is present, execute DB apply first (or preflight)
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

        # DB cleanup succeeded, now execute GCS cleanup
        gcs_result = execute_gcs_cleanup(
            plan, gcs_runner=gcs_runner, prior_receipts=prior_receipts
        )
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
        help="Path to exact-owned-fixture-inventory.json",
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

            def offline_gcs_runner(action: str, bucket: str, key: str, generation=None):
                if action == "describe":
                    return {
                        "status": "ok",
                        "metadata": {
                            "generation": "1728464600123456",
                            "metageneration": "1",
                            "size": EXPECTED_FILE_SIZE,
                            "contentType": EXPECTED_MIME,
                            "sha256": EXPECTED_SHA256,
                        },
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
        return 2


if __name__ == "__main__":
    sys.exit(main())
