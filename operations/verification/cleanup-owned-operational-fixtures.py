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
- GCS deletion requires exact generation match and verifies subsequent absent read.
- Database mutations require narrow guarded transaction; if no safe authorized runner
  is available in the current lane, reports a concrete blocker rather than attempting
  unreviewed arbitrary SQL / node -e / job override workarounds.
- Zero socket or network calls on VM (stdlib only; external boundary mocked in unit tests).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

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
    "Current authorized hosted workflow lane (WIF github-actions-deployer) lacks "
    "direct private network connectivity to Cloud SQL drts-dev-devcc-20260825:us-central1:drts-dev-db "
    "and does not hold DATABASE_URL secrets. Executing database mutations requires a dedicated "
    "reviewed maintenance runner with Cloud SQL access; inventing unreviewed arbitrary SQL execution, "
    "node -e workarounds, default migration job mutation, or extra IAM grants is strictly prohibited "
    "under repository governance and VM restrictions."
)


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def validate_full_sha(value: Any, name: str = "SHA") -> str:
    require(
        isinstance(value, str) and bool(re.fullmatch(r"[0-9a-f]{40}", value)),
        f"Expected immutable 40-character lowercase hex {name}, got: {value!r}",
    )
    return value


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
) -> None:
    expected_run = run_id or EXPECTED_PRODUCT_RUN_ID
    expected_src = validate_full_sha(
        source_sha or EXPECTED_SOURCE_SHA, "source_sha"
    )

    actual_source = inventory_or_evidence.get(
        "source_sha"
    ) or inventory_or_evidence.get("source_runtime_sha")
    require(
        actual_source == expected_src,
        f"Source SHA mismatch: expected {expected_src}, got {actual_source}",
    )

    actual_run = inventory_or_evidence.get(
        "run_id"
    ) or inventory_or_evidence.get("product_run_id")
    require(
        actual_run == expected_run,
        f"Product run ID mismatch: expected {expected_run}, got {actual_run}",
    )

    if definition_sha or "workflow_definition_sha" in inventory_or_evidence:
        expected_def = validate_full_sha(
            definition_sha or EXPECTED_WORKFLOW_DEF_SHA, "definition_sha"
        )
        actual_def = inventory_or_evidence.get("workflow_definition_sha")
        if actual_def:
            require(
                actual_def == expected_def,
                f"Workflow definition SHA mismatch: expected {expected_def}, got {actual_def}",
            )

    if artifact_id:
        require(
            artifact_id == EXPECTED_ARTIFACT_ID,
            f"Artifact ID mismatch: expected {EXPECTED_ARTIFACT_ID}, got {artifact_id}",
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

    seen_doc_ids = set()
    seen_keys = set()
    validated_docs = []

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
    cancelled_business_records = set()
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


def build_cleanup_plan(
    inventory_data: Dict[str, Any],
    mode: str = "dry-run",
) -> Dict[str, Any]:
    require(mode in ("dry-run", "apply"), f"Invalid mode: {mode}")
    validate_provenance(inventory_data)
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

    db_targets = {
        "documents": [doc["document_id"] for doc in validated_docs],
        "submissions": list(CANONICAL_OWNED_SUBMISSIONS),
        "fleet_partner_id": EXPECTED_FLEET_PARTNER_ID,
        "guarded_statements": [
            {
                "table": "fleet.supply_documents",
                "operation": "DELETE",
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
                "sql": (
                    "DELETE FROM fleet.driver_supply_drafts "
                    "WHERE submission_id = ANY($1::uuid[])"
                ),
                "params": [list(CANONICAL_OWNED_SUBMISSIONS)],
            },
            {
                "table": "fleet.vehicle_supply_drafts",
                "operation": "DELETE",
                "sql": (
                    "DELETE FROM fleet.vehicle_supply_drafts "
                    "WHERE submission_id = ANY($1::uuid[])"
                ),
                "params": [list(CANONICAL_OWNED_SUBMISSIONS)],
            },
            {
                "table": "fleet.supply_review_events",
                "operation": "DELETE",
                "sql": (
                    "DELETE FROM fleet.supply_review_events "
                    "WHERE submission_id = ANY($1::uuid[])"
                ),
                "params": [list(CANONICAL_OWNED_SUBMISSIONS)],
            },
            {
                "table": "fleet.supply_submissions",
                "operation": "DELETE",
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
) -> Dict[str, Any]:
    """Production gcloud storage boundary runner."""
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
            cmd, capture_output=True, text=True, check=False, timeout=30
        )
        if res.returncode != 0:
            return {"status": "not_found", "returncode": res.returncode}
        try:
            data = json.loads(res.stdout)
            return {"status": "ok", "metadata": data}
        except ValueError:
            raise ValueError(f"Malformed GCS describe output for {gs_url}")

    elif action == "delete":
        require(
            generation is not None, "Delete requires explicit generation match"
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
            cmd, capture_output=True, text=True, check=False, timeout=30
        )
        if res.returncode != 0:
            return {
                "status": "error",
                "returncode": res.returncode,
                "stderr": "gcloud storage rm failed",
            }
        return {"status": "ok", "deleted": True}

    raise ValueError(f"Unknown GCS runner action: {action}")


def execute_gcs_cleanup(
    plan: Dict[str, Any],
    gcs_runner: Optional[Callable[..., Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    runner = gcs_runner or default_gcs_runner
    mode = plan["mode"]
    targets = plan["gcs_targets"]

    receipts = []
    for item in targets:
        bucket = item["bucket"]
        key = item["key"]
        expected_size = item["expected_size"]

        # 1. Describe object to inspect live generation and metadata
        desc = runner("describe", bucket, key)
        if desc.get("status") == "not_found":
            receipts.append(
                {
                    "key": key,
                    "status": "already_absent",
                    "bucket": bucket,
                    "verified_absent": True,
                }
            )
            continue

        meta = desc.get("metadata", {})
        live_generation = str(meta.get("generation", ""))
        require(
            bool(live_generation),
            f"Missing object generation for gs://{bucket}/{key}",
        )

        live_size = int(meta.get("size", 0))
        require(
            live_size == expected_size,
            f"Object size mismatch for gs://{bucket}/{key}: expected {expected_size}, got {live_size}",
        )

        if mode == "dry-run":
            receipts.append(
                {
                    "key": key,
                    "status": "planned",
                    "bucket": bucket,
                    "generation": live_generation,
                    "action": "dry-run (no mutation)",
                }
            )
            continue

        # 2. Mode is apply: execute generation-matched deletion
        del_res = runner("delete", bucket, key, generation=live_generation)
        require(
            del_res.get("status") == "ok",
            f"GCS deletion failed for gs://{bucket}/{key} with generation {live_generation}",
        )

        # 3. Subsequent absent read verification
        post_desc = runner("describe", bucket, key)
        require(
            post_desc.get("status") == "not_found",
            f"Object gs://{bucket}/{key} still present after deletion!",
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
    """Execute DB cleanup only when an authorized runner is provided; else report blocker."""
    if db_runner is None:
        return {
            "status": "blocked",
            "concrete_blocker": plan["db_blocker"],
            "plan_prepared": True,
            "statements": [
                s["table"] for s in plan["db_targets"]["guarded_statements"]
            ],
            "receipts": [],
        }

    # If an authorized DB runner is supplied (e.g., in unit tests with mock DB connection):
    db_receipts = []
    for stmt in plan["db_targets"]["guarded_statements"]:
        res = db_runner(stmt["sql"], stmt["params"])
        require(
            res.get("status") == "ok",
            f"DB execution error on table {stmt['table']}",
        )
        db_receipts.append(
            {
                "table": stmt["table"],
                "operation": stmt["operation"],
                "rows_affected": res.get("rows_affected", 0),
            }
        )

    return {
        "status": "applied",
        "concrete_blocker": None,
        "plan_prepared": True,
        "receipts": db_receipts,
    }


def run_cleanup_pipeline(
    inventory_data: Dict[str, Any],
    mode: str = "dry-run",
    gcs_runner: Optional[Callable[..., Dict[str, Any]]] = None,
    db_runner: Optional[Callable[[str, List[Any]], Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    plan = build_cleanup_plan(inventory_data, mode=mode)
    gcs_result = execute_gcs_cleanup(plan, gcs_runner=gcs_runner)
    db_result = execute_db_cleanup(plan, db_runner=db_runner)

    return {
        "mode": mode,
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
        required=True,
        help="Path to exact-owned-fixture-inventory.json",
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

    inventory_path = Path(args.inventory)
    if not inventory_path.is_file():
        sys.stderr.write(f"Inventory file not found: {args.inventory}\n")
        return 1

    try:
        with open(inventory_path, "r", encoding="utf-8") as f:
            inventory_data = json.load(f)

        gcs_runner = None
        if args.offline:
            require(args.mode == "dry-run", "Offline mode only supports dry-run")

            def offline_gcs_runner(action: str, bucket: str, key: str, generation=None):
                if action == "describe":
                    return {
                        "status": "ok",
                        "metadata": {
                            "generation": "offline-inventory-generation",
                            "size": EXPECTED_FILE_SIZE,
                            "contentType": EXPECTED_MIME,
                        },
                    }
                raise ValueError("Mutation prohibited in offline mode")

            gcs_runner = offline_gcs_runner

        result = run_cleanup_pipeline(
            inventory_data=inventory_data,
            mode=args.mode,
            gcs_runner=gcs_runner,
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

        return 0
    except Exception as exc:
        sys.stderr.write(f"Error during fixture cleanup: {exc}\n")
        return 2


if __name__ == "__main__":
    sys.exit(main())
