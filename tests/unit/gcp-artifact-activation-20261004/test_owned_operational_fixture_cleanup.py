"""Unit tests for owned operational fixture cleanup planner & executor.

Executes actual collector/planner/guard code with ONLY external boundaries mocked.
No network requests, zero socket connections, pure Python stdlib.
Relocated from operations/verification/test_cleanup_owned_operational_fixtures.py
into the mandatory CI discovery root tests/unit/gcp-artifact-activation-20261004/.
"""
from __future__ import annotations

import copy
import hashlib
import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path
from typing import Any, Dict, List
from unittest.mock import MagicMock, patch

REPO_ROOT = Path(__file__).resolve().parents[3]
MODULE_PATH = REPO_ROOT / "operations" / "verification" / "cleanup-owned-operational-fixtures.py"
SPEC = importlib.util.spec_from_file_location("cleanup_tool", MODULE_PATH)
cleanup = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(cleanup)

# Authoritative authentic artifact test data (derived directly from real run 37906298090 / artifact 11606165993)
AUTHENTIC_ARTIFACTS_JSON = {
    "total_count": 1,
    "artifacts": [
        {
            "id": 11606165993,
            "name": f"operational-browser-evidence-{cleanup.EXPECTED_SOURCE_SHA}",
            "size_in_bytes": 5850,
            "digest": cleanup.EXPECTED_ARTIFACT_DIGEST,
            "workflow_run": {
                "id": cleanup.EXPECTED_PRODUCT_RUN_ID,
                "head_sha": cleanup.EXPECTED_WORKFLOW_DEF_SHA,
                "head_branch": "publish/v2026.10.08.0",
            },
        }
    ],
}

AUTHENTIC_REPORT_JSON = {
    "config": {
        "metadata": {
            "ci": {
                "commitHash": cleanup.EXPECTED_WORKFLOW_DEF_SHA,
                "buildHref": f"https://github.com/ajoe734/drts-fleet-platform/actions/runs/{cleanup.EXPECTED_PRODUCT_RUN_ID}",
            },
            "gitCommit": {
                "hash": cleanup.EXPECTED_SOURCE_SHA,
            },
        }
    },
    "stats": {
        "expected": 16,
        "unexpected": 0,
        "flaky": 0,
        "skipped": 0,
    },
}

AUTHENTIC_EVIDENCE_JSON = {
    "candidateSha": cleanup.EXPECTED_SOURCE_SHA,
    "manifest": "drts-operational-journeys.i8qrzm.json",
    "evidence": [
        {
            "candidateSha": cleanup.EXPECTED_SOURCE_SHA,
            "kind": "mutation-readback",
            "journey": "referral-create-read-cancel-receipt",
            "operation": "cancel",
            "resultId": cleanup.PRESERVED_BUSINESS_RECORDS[0],
            "readbackState": "cancelled",
        },
        {
            "candidateSha": cleanup.EXPECTED_SOURCE_SHA,
            "kind": "mutation-readback",
            "journey": "enterprise-create-read-update-cancel",
            "operation": "cancel",
            "resultId": cleanup.PRESERVED_BUSINESS_RECORDS[1],
            "readbackState": "cancelled",
        },
    ],
}

# Populate the 8 authentic document upload chains in the evidence
for _key, _meta in cleanup.CANONICAL_OWNED_OBJECTS.items():
    AUTHENTIC_EVIDENCE_JSON["evidence"].append(
        {
            "candidateSha": cleanup.EXPECTED_SOURCE_SHA,
            "recordedAt": "2026-10-09T09:03:18.572Z",
            "putStatus": 200,
            "putScanState": "clean",
            "downloadStatus": 200,
            "kind": "setup-document-upload",
            "surface": "fleet",
            "actorScope": "fleet partner",
            "documentId": _meta["documentId"],
            "objectKey": _key,
            "fileSize": cleanup.EXPECTED_FILE_SIZE,
            "sha256": cleanup.EXPECTED_SHA256,
            "intentStatus": 201,
            "confirmStatus": 201,
            "readbackFileSize": cleanup.EXPECTED_FILE_SIZE,
            "confirmSubmissionId": _meta["confirmSubmissionId"],
            "confirmFleetPartnerId": cleanup.EXPECTED_FLEET_PARTNER_ID,
            "confirmDocumentType": _meta["document_type"],
            "readbackSha256": cleanup.EXPECTED_SHA256,
            "readbackFileSize": cleanup.EXPECTED_FILE_SIZE,
            "readbackContentType": cleanup.EXPECTED_MIME,
        }
    )


def create_authentic_inventory() -> Dict[str, Any]:
    """Create authentic inventory dict directly from authoritative constants."""
    docs = []
    for key, val in cleanup.CANONICAL_OWNED_OBJECTS.items():
        docs.append(
            {
                "candidateSha": cleanup.EXPECTED_SOURCE_SHA,
                "recordedAt": "2026-10-09T09:03:18.572Z",
                "kind": "setup-document-upload",
                "journey": "fleet-submit-read-withdraw-resubmit",
                "surface": "fleet",
                "actorScope": "fleet partner",
                "documentId": val["documentId"],
                "objectKey": key,
                "fileSize": cleanup.EXPECTED_FILE_SIZE,
                "sha256": cleanup.EXPECTED_SHA256,
                "confirmSubmissionId": val["confirmSubmissionId"],
                "confirmFleetPartnerId": cleanup.EXPECTED_FLEET_PARTNER_ID,
                "confirmDocumentType": val["document_type"],
                "readbackSha256": cleanup.EXPECTED_SHA256,
                "readbackFileSize": cleanup.EXPECTED_FILE_SIZE,
                "readbackContentType": cleanup.EXPECTED_MIME,
            }
        )
    return {
        "source_sha": cleanup.EXPECTED_SOURCE_SHA,
        "run_id": cleanup.EXPECTED_PRODUCT_RUN_ID,
        "workflow_definition_sha": cleanup.EXPECTED_WORKFLOW_DEF_SHA,
        "artifact_id": cleanup.EXPECTED_ARTIFACT_ID,
        "artifact_digest": cleanup.EXPECTED_ARTIFACT_DIGEST,
        "run_bounds": {"start": cleanup.EXPECTED_RUN_BOUNDS_START, "end": cleanup.EXPECTED_RUN_BOUNDS_END},
        "authority_established": True,
        "storage_documents": docs,
        "mutation_records": [
            {
                "candidateSha": cleanup.EXPECTED_SOURCE_SHA,
                "recordedAt": "2026-10-09T09:02:43.195Z",
                "kind": "mutation-readback",
                "journey": "referral-create-read-cancel-receipt",
                "surface": "referral",
                "operation": "cancel",
                "resultId": cleanup.PRESERVED_BUSINESS_RECORDS[0],
                "readbackState": "cancelled",
            },
            {
                "candidateSha": cleanup.EXPECTED_SOURCE_SHA,
                "recordedAt": "2026-10-09T09:02:47.192Z",
                "kind": "mutation-readback",
                "journey": "enterprise-create-read-update-cancel",
                "surface": "enterprise",
                "operation": "cancel",
                "resultId": cleanup.PRESERVED_BUSINESS_RECORDS[1],
                "readbackState": "cancelled",
            },
        ],
        "cleanup_not_performed": True,
        "preserve_failed_8d_03a_and_user_data": True,
    }


class TestProvenanceValidation(unittest.TestCase):
    def setUp(self):
        self.data = create_authentic_inventory()

    def test_authentic_provenance_passes(self):
        cleanup.validate_provenance(
            self.data,
            run_id=cleanup.EXPECTED_PRODUCT_RUN_ID,
            source_sha=cleanup.EXPECTED_SOURCE_SHA,
            definition_sha=cleanup.EXPECTED_WORKFLOW_DEF_SHA,
            artifact_id=cleanup.EXPECTED_ARTIFACT_ID,
            artifact_digest=cleanup.EXPECTED_ARTIFACT_DIGEST,
        )

    def test_wrong_run_id_raises(self):
        data = copy.deepcopy(self.data)
        data["run_id"] = 12345
        with self.assertRaises(ValueError) as ctx:
            cleanup.validate_provenance(data, run_id=12345)
        self.assertIn("Enforced product run ID mismatch", str(ctx.exception))

    def test_wrong_source_sha_raises(self):
        data = copy.deepcopy(self.data)
        data["source_sha"] = "0000000000000000000000000000000000000000"
        with self.assertRaises(ValueError) as ctx:
            cleanup.validate_provenance(
                data, source_sha="0000000000000000000000000000000000000000"
            )
        self.assertIn("Enforced source SHA mismatch", str(ctx.exception))

    def test_wrong_workflow_definition_sha_raises(self):
        data = copy.deepcopy(self.data)
        data["workflow_definition_sha"] = "1111111111111111111111111111111111111111"
        with self.assertRaises(ValueError) as ctx:
            cleanup.validate_provenance(data)
        self.assertIn("Workflow definition SHA mismatch", str(ctx.exception))

    def test_wrong_artifact_id_raises(self):
        data = copy.deepcopy(self.data)
        data["artifact_id"] = 99999999999
        with self.assertRaises(ValueError) as ctx:
            cleanup.validate_provenance(data)
        self.assertIn("Artifact ID mismatch", str(ctx.exception))

    def test_wrong_artifact_digest_raises(self):
        with self.assertRaises(ValueError) as ctx:
            cleanup.validate_provenance(
                self.data, artifact_digest="sha256:0000000000000000000000000000000000000000"
            )
        self.assertIn("Artifact digest mismatch", str(ctx.exception))

    def test_invalid_sha_format_raises(self):
        with self.assertRaises(ValueError):
            cleanup.validate_full_sha("not-a-sha")
        with self.assertRaises(ValueError):
            cleanup.validate_full_sha("4a166f3")  # short SHA rejected

    def test_forged_bounds_rejected(self):
        data = copy.deepcopy(self.data)
        data["run_bounds"] = {"start": "2020-01-01T00:00:00Z", "end": "2030-01-01T00:00:00Z"}
        with self.assertRaises(ValueError) as ctx:
            cleanup.validate_provenance(data)
        self.assertIn("run_bounds start mismatch", str(ctx.exception))

    def test_missing_bounds_rejected(self):
        data = copy.deepcopy(self.data)
        del data["run_bounds"]
        with self.assertRaises(ValueError) as ctx:
            cleanup.validate_provenance(data)
        self.assertIn("Missing mandatory run_bounds", str(ctx.exception))


class TestAuthoritativeArtifactCollection(unittest.TestCase):
    def setUp(self):
        import hashlib
        import zipfile
        import io
        
        self.run_meta = {
            "id": cleanup.EXPECTED_PRODUCT_RUN_ID, 
            "head_sha": cleanup.EXPECTED_WORKFLOW_DEF_SHA,
            "status": "completed",
            "conclusion": "success",
            "run_started_at": cleanup.EXPECTED_FULL_RUN_START,
            "repository": {"full_name": "ajoe734/drts-fleet-platform"}
        }
        jobs = []
        expected_ids = [113740473026, 113740518866, 113744327840, 113745681997, 
                        113746824327, 113747086904, 113747511276, 113748909497]
        for i, job_id in enumerate(expected_ids):
            jobs.append({
                "id": job_id,
                "name": f"other job {i}",
                "status": "completed",
                "conclusion": "success",
                "run_id": cleanup.EXPECTED_PRODUCT_RUN_ID,
                "head_sha": cleanup.EXPECTED_WORKFLOW_DEF_SHA,
                "started_at": cleanup.EXPECTED_RUN_BOUNDS_START,
                "completed_at": cleanup.EXPECTED_RUN_BOUNDS_END,
                "html_url": f"https://github.com/ajoe734/drts-fleet-platform/actions/runs/{cleanup.EXPECTED_PRODUCT_RUN_ID}/job/{job_id}",
                "url": f"https://api.github.com/repos/ajoe734/drts-fleet-platform/actions/jobs/{job_id}"
            })
        jobs.append({
            "id": 113747921500,
            "name": "acceptance tests", "status": "completed", "conclusion": "success", 
            "run_id": cleanup.EXPECTED_PRODUCT_RUN_ID, 
            "completed_at": cleanup.EXPECTED_RUN_BOUNDS_END, 
            "started_at": cleanup.EXPECTED_RUN_BOUNDS_START, 
            "head_sha": cleanup.EXPECTED_WORKFLOW_DEF_SHA, 
            "html_url": f"https://github.com/ajoe734/drts-fleet-platform/actions/runs/{cleanup.EXPECTED_PRODUCT_RUN_ID}/job/113747921500",
            "url": "https://api.github.com/repos/ajoe734/drts-fleet-platform/actions/jobs/113747921500"
        })
        self.jobs_meta = {"jobs": jobs, "total_count": 9}
        
        # Create a real zip containing report.json and operational-browser-evidence.json
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, 'w') as zf:
            zf.writestr("operational-browser/report.json", json.dumps(AUTHENTIC_REPORT_JSON))
            zf.writestr("operational-browser/operational-browser-evidence.json", json.dumps(AUTHENTIC_EVIDENCE_JSON))
        
        self.mock_zip_content = buf.getvalue()
        self.mock_hash = hashlib.sha256(self.mock_zip_content).hexdigest()
        
    def test_load_and_validate_authoritative_artifact(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            dir_path = Path(tmpdir)
            (dir_path / "evidence.zip").write_bytes(self.mock_zip_content)
            
            art_meta = copy.deepcopy(AUTHENTIC_ARTIFACTS_JSON)
            art_meta["artifacts"][0]["digest"] = "sha256:" + self.mock_hash
            
            (dir_path / "artifacts.json").write_text(json.dumps(art_meta), encoding="utf-8")
            (dir_path / "run.json").write_text(json.dumps(self.run_meta), encoding="utf-8")
            (dir_path / "jobs.json").write_text(json.dumps(self.jobs_meta), encoding="utf-8")

            with patch.object(cleanup, 'EXPECTED_ARTIFACT_DIGEST', 'sha256:' + self.mock_hash):
                inv = cleanup.load_and_validate_authoritative_artifact(dir_path)
            self.assertEqual(len(inv["storage_documents"]), cleanup.OWNED_OBJECT_COUNT)
            self.assertEqual(inv["source_sha"], cleanup.EXPECTED_SOURCE_SHA)
            self.assertEqual(inv["run_id"], cleanup.EXPECTED_PRODUCT_RUN_ID)
            
    def test_missing_run_json_fails(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            dir_path = Path(tmpdir)
            (dir_path / "evidence.zip").write_bytes(self.mock_zip_content)
            art_meta = copy.deepcopy(AUTHENTIC_ARTIFACTS_JSON)
            art_meta["artifacts"][0]["digest"] = "sha256:" + self.mock_hash
            (dir_path / "artifacts.json").write_text(json.dumps(art_meta), encoding="utf-8")
            (dir_path / "jobs.json").write_text(json.dumps(self.jobs_meta), encoding="utf-8")
            
            with patch.object(cleanup, 'EXPECTED_ARTIFACT_DIGEST', 'sha256:' + self.mock_hash):
                with self.assertRaises(ValueError) as ctx:
                    cleanup.load_and_validate_authoritative_artifact(dir_path)
                self.assertIn("run.json not found", str(ctx.exception))

    def test_tampered_artifact_id_rejected(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            dir_path = Path(tmpdir)
            (dir_path / "evidence.zip").write_bytes(self.mock_zip_content)
            
            tampered = copy.deepcopy(AUTHENTIC_ARTIFACTS_JSON)
            tampered["artifacts"][0]["id"] = 99999
            tampered["artifacts"][0]["digest"] = self.mock_hash
            
            (dir_path / "artifacts.json").write_text(json.dumps(tampered), encoding="utf-8")
            (dir_path / "report.json").write_text(json.dumps(AUTHENTIC_REPORT_JSON), encoding="utf-8")
            (dir_path / "operational-browser-evidence.json").write_text(
                json.dumps(AUTHENTIC_EVIDENCE_JSON), encoding="utf-8"
            )
            with patch.object(cleanup, 'EXPECTED_ARTIFACT_DIGEST', 'sha256:' + self.mock_hash):
                with self.assertRaises(ValueError) as ctx:
                    cleanup.load_and_validate_authoritative_artifact(dir_path)
            self.assertIn("not found in artifacts.json", str(ctx.exception))

    def test_tampered_report_failures_rejected(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            dir_path = Path(tmpdir)
            (dir_path / "evidence.zip").write_bytes(self.mock_zip_content)
            
            art_meta = copy.deepcopy(AUTHENTIC_ARTIFACTS_JSON)
            art_meta["artifacts"][0]["digest"] = "sha256:" + self.mock_hash
            
            (dir_path / "artifacts.json").write_text(
                json.dumps(art_meta), encoding="utf-8"
            )
            (dir_path / "run.json").write_text(json.dumps(self.run_meta), encoding="utf-8")
            (dir_path / "jobs.json").write_text(json.dumps(self.jobs_meta), encoding="utf-8")
            tampered_report = copy.deepcopy(AUTHENTIC_REPORT_JSON)
            tampered_report["stats"]["unexpected"] = 1
            import io
            import zipfile
            import hashlib
            buf = io.BytesIO()
            with zipfile.ZipFile(buf, 'w') as zf:
                zf.writestr("report.json", json.dumps(tampered_report))
                zf.writestr("operational-browser-evidence.json", json.dumps(AUTHENTIC_EVIDENCE_JSON))
            tampered_zip = buf.getvalue()
            tampered_hash = hashlib.sha256(tampered_zip).hexdigest()
            (dir_path / "evidence.zip").write_bytes(tampered_zip)
            
            art_meta = json.loads((dir_path / "artifacts.json").read_text(encoding="utf-8"))
            art_meta["artifacts"][0]["digest"] = "sha256:" + tampered_hash
            (dir_path / "artifacts.json").write_text(json.dumps(art_meta), encoding="utf-8")
            
            with patch.object(cleanup, 'EXPECTED_ARTIFACT_DIGEST', 'sha256:' + tampered_hash):
                with self.assertRaises(ValueError) as ctx:
                    cleanup.load_and_validate_authoritative_artifact(dir_path)
            self.assertIn("Unexpected failures in report", str(ctx.exception))

    def test_pipeline_without_archive_returns_unverified_planning_only(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            dir_path = Path(tmpdir)
            # Do NOT write evidence.zip
            
            art_meta = copy.deepcopy(AUTHENTIC_ARTIFACTS_JSON)
            (dir_path / "artifacts.json").write_text(json.dumps(art_meta), encoding="utf-8")
            (dir_path / "run.json").write_text(json.dumps(self.run_meta), encoding="utf-8")
            (dir_path / "jobs.json").write_text(json.dumps(self.jobs_meta), encoding="utf-8")
            
            res = cleanup.load_and_validate_authoritative_artifact(dir_path)
            self.assertTrue(res.get("unverified_planning_only"))
            self.assertIn("No archive zip found for hashing", res.get("error_reason", ""))

    def test_missing_required_jobs_rejected(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            dir_path = Path(tmpdir)
            (dir_path / "evidence.zip").write_bytes(self.mock_zip_content)
            
            art_meta = copy.deepcopy(AUTHENTIC_ARTIFACTS_JSON)
            art_meta["artifacts"][0]["digest"] = "sha256:" + self.mock_hash
            (dir_path / "artifacts.json").write_text(json.dumps(art_meta), encoding="utf-8")
            (dir_path / "run.json").write_text(json.dumps(self.run_meta), encoding="utf-8")
            
            bad_jobs = copy.deepcopy(self.jobs_meta)
            bad_jobs["jobs"] = [bad_jobs["jobs"][-1]] # Keep only acceptance
            (dir_path / "jobs.json").write_text(json.dumps(bad_jobs), encoding="utf-8")
            
            with patch.object(cleanup, 'EXPECTED_ARTIFACT_DIGEST', 'sha256:' + self.mock_hash):
                with self.assertRaises(ValueError) as ctx:
                    cleanup.load_and_validate_authoritative_artifact(dir_path)
            self.assertIn("Expected exactly 9 required jobs", str(ctx.exception))

    def test_duplicate_acceptance_rejected(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            dir_path = Path(tmpdir)
            (dir_path / "evidence.zip").write_bytes(self.mock_zip_content)
            
            art_meta = copy.deepcopy(AUTHENTIC_ARTIFACTS_JSON)
            art_meta["artifacts"][0]["digest"] = "sha256:" + self.mock_hash
            (dir_path / "artifacts.json").write_text(json.dumps(art_meta), encoding="utf-8")
            (dir_path / "run.json").write_text(json.dumps(self.run_meta), encoding="utf-8")
            
            bad_jobs = copy.deepcopy(self.jobs_meta)
            bad_jobs["jobs"].append(bad_jobs["jobs"][-1]) # Duplicate acceptance
            (dir_path / "jobs.json").write_text(json.dumps(bad_jobs), encoding="utf-8")
            
            with patch.object(cleanup, 'EXPECTED_ARTIFACT_DIGEST', 'sha256:' + self.mock_hash):
                with self.assertRaises(ValueError) as ctx:
                    cleanup.load_and_validate_authoritative_artifact(dir_path)
            self.assertIn("Expected exactly 1 acceptance job", str(ctx.exception))
            
    def test_failed_completed_other_job_rejected(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            dir_path = Path(tmpdir)
            (dir_path / "evidence.zip").write_bytes(self.mock_zip_content)
            
            art_meta = copy.deepcopy(AUTHENTIC_ARTIFACTS_JSON)
            art_meta["artifacts"][0]["digest"] = "sha256:" + self.mock_hash
            (dir_path / "artifacts.json").write_text(json.dumps(art_meta), encoding="utf-8")
            (dir_path / "run.json").write_text(json.dumps(self.run_meta), encoding="utf-8")
            
            bad_jobs = copy.deepcopy(self.jobs_meta)
            bad_jobs["jobs"][0]["conclusion"] = "failure"
            (dir_path / "jobs.json").write_text(json.dumps(bad_jobs), encoding="utf-8")
            
            with patch.object(cleanup, 'EXPECTED_ARTIFACT_DIGEST', 'sha256:' + self.mock_hash):
                with self.assertRaises(ValueError) as ctx:
                    cleanup.load_and_validate_authoritative_artifact(dir_path)
            self.assertIn("was not successful", str(ctx.exception))

    def test_foreign_url_rejected(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            dir_path = Path(tmpdir)
            (dir_path / "evidence.zip").write_bytes(self.mock_zip_content)
            
            art_meta = copy.deepcopy(AUTHENTIC_ARTIFACTS_JSON)
            art_meta["artifacts"][0]["digest"] = "sha256:" + self.mock_hash
            (dir_path / "artifacts.json").write_text(json.dumps(art_meta), encoding="utf-8")
            (dir_path / "run.json").write_text(json.dumps(self.run_meta), encoding="utf-8")
            
            bad_jobs = copy.deepcopy(self.jobs_meta)
            bad_jobs["jobs"][-1]["html_url"] = "https://example.invalid/ajoe734/drts-fleet-platform/actions/runs/1/job/1"
            (dir_path / "jobs.json").write_text(json.dumps(bad_jobs), encoding="utf-8")
            
            with patch.object(cleanup, 'EXPECTED_ARTIFACT_DIGEST', 'sha256:' + self.mock_hash):
                with self.assertRaises(ValueError) as ctx:
                    cleanup.load_and_validate_authoritative_artifact(dir_path)
            self.assertIn("Acceptance job foreign repository/URL", str(ctx.exception))

    def test_job_missing_started_at_rejected(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            dir_path = Path(tmpdir)
            (dir_path / "evidence.zip").write_bytes(self.mock_zip_content)
            
            art_meta = copy.deepcopy(AUTHENTIC_ARTIFACTS_JSON)
            art_meta["artifacts"][0]["digest"] = "sha256:" + self.mock_hash
            (dir_path / "artifacts.json").write_text(json.dumps(art_meta), encoding="utf-8")
            (dir_path / "run.json").write_text(json.dumps(self.run_meta), encoding="utf-8")
            
            bad_jobs = copy.deepcopy(self.jobs_meta)
            del bad_jobs["jobs"][0]["started_at"]
            (dir_path / "jobs.json").write_text(json.dumps(bad_jobs), encoding="utf-8")
            
            with patch.object(cleanup, 'EXPECTED_ARTIFACT_DIGEST', 'sha256:' + self.mock_hash):
                with self.assertRaises(ValueError) as ctx:
                    cleanup.load_and_validate_authoritative_artifact(dir_path)
            self.assertIn("missing started_at", str(ctx.exception))

    def test_job_reversed_dates_rejected(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            dir_path = Path(tmpdir)
            (dir_path / "evidence.zip").write_bytes(self.mock_zip_content)
            
            art_meta = copy.deepcopy(AUTHENTIC_ARTIFACTS_JSON)
            art_meta["artifacts"][0]["digest"] = "sha256:" + self.mock_hash
            (dir_path / "artifacts.json").write_text(json.dumps(art_meta), encoding="utf-8")
            (dir_path / "run.json").write_text(json.dumps(self.run_meta), encoding="utf-8")
            
            bad_jobs = copy.deepcopy(self.jobs_meta)
            # Reverse start and end
            bad_jobs["jobs"][0]["started_at"] = cleanup.EXPECTED_RUN_BOUNDS_END
            bad_jobs["jobs"][0]["completed_at"] = cleanup.EXPECTED_RUN_BOUNDS_START
            (dir_path / "jobs.json").write_text(json.dumps(bad_jobs), encoding="utf-8")
            
            with patch.object(cleanup, 'EXPECTED_ARTIFACT_DIGEST', 'sha256:' + self.mock_hash):
                with self.assertRaises(ValueError) as ctx:
                    cleanup.load_and_validate_authoritative_artifact(dir_path)
            self.assertIn("out of bounds or reversed", str(ctx.exception))

    def test_wrong_total_count_rejected(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            dir_path = Path(tmpdir)
            (dir_path / "evidence.zip").write_bytes(self.mock_zip_content)
            
            art_meta = copy.deepcopy(AUTHENTIC_ARTIFACTS_JSON)
            art_meta["artifacts"][0]["digest"] = "sha256:" + self.mock_hash
            (dir_path / "artifacts.json").write_text(json.dumps(art_meta), encoding="utf-8")
            (dir_path / "run.json").write_text(json.dumps(self.run_meta), encoding="utf-8")
            
            bad_jobs = copy.deepcopy(self.jobs_meta)
            bad_jobs["total_count"] = 100
            (dir_path / "jobs.json").write_text(json.dumps(bad_jobs), encoding="utf-8")
            
            with patch.object(cleanup, 'EXPECTED_ARTIFACT_DIGEST', 'sha256:' + self.mock_hash):
                with self.assertRaises(ValueError) as ctx:
                    cleanup.load_and_validate_authoritative_artifact(dir_path)
            self.assertIn("Expected total_count 9", str(ctx.exception))

class TestInventoryValidation(unittest.TestCase):
    def setUp(self):
        self.data = create_authentic_inventory()

    def test_authentic_inventory_passes(self):
        docs = cleanup.validate_inventory_items(self.data)
        self.assertEqual(len(docs), cleanup.OWNED_OBJECT_COUNT)

    def test_wrong_document_count_raises(self):
        data = copy.deepcopy(self.data)
        data["storage_documents"].pop()  # 7 docs instead of 8
        with self.assertRaises(ValueError) as ctx:
            cleanup.validate_inventory_items(data)
        self.assertIn("Expected exactly 8 storage documents", str(ctx.exception))

    def test_foreign_partner_raises(self):
        data = copy.deepcopy(self.data)
        data["storage_documents"][0]["confirmFleetPartnerId"] = "foreign-partner-999"
        with self.assertRaises(ValueError) as ctx:
            cleanup.validate_inventory_items(data)
        self.assertIn("Foreign fleetPartnerId", str(ctx.exception))

    def test_path_traversal_in_key_raises(self):
        data = copy.deepcopy(self.data)
        data["storage_documents"][0]["objectKey"] = (
            f"{cleanup.KEY_PREFIX}../malicious.pdf"
        )
        with self.assertRaises(ValueError) as ctx:
            cleanup.validate_inventory_items(data)
        self.assertIn("Path traversal rejected", str(ctx.exception))

    def test_tampered_file_size_raises(self):
        data = copy.deepcopy(self.data)
        data["storage_documents"][0]["fileSize"] = 328
        with self.assertRaises(ValueError) as ctx:
            cleanup.validate_inventory_items(data)
        self.assertIn("Unexpected file size", str(ctx.exception))

    def test_tampered_sha256_raises(self):
        data = copy.deepcopy(self.data)
        data["storage_documents"][0]["sha256"] = (
            "0000000000000000000000000000000000000000000000000000000000000000"
        )
        with self.assertRaises(ValueError) as ctx:
            cleanup.validate_inventory_items(data)
        self.assertIn("Unexpected SHA-256 hash", str(ctx.exception))

    def test_tampered_mime_type_raises(self):
        data = copy.deepcopy(self.data)
        data["storage_documents"][0]["readbackContentType"] = "text/plain"
        with self.assertRaises(ValueError) as ctx:
            cleanup.validate_inventory_items(data)
        self.assertIn("Unexpected content type", str(ctx.exception))

    def test_missing_cancellation_audit_raises(self):
        data = copy.deepcopy(self.data)
        data["mutation_records"] = []
        with self.assertRaises(ValueError) as ctx:
            cleanup.validate_inventory_items(data)
        self.assertIn("must have a cancellation audit record", str(ctx.exception))


class TestGcsErrorClassificationAndValidation(unittest.TestCase):
    def test_default_gcs_runner_classifies_404_correctly(self):
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(
                returncode=1,
                stderr="ERROR: (gcloud.storage.objects.describe) HTTPStatus 404: No such object",
                stdout="",
            )
            res = cleanup.default_gcs_runner("describe", cleanup.BUCKET, "some/key.pdf")
            self.assertEqual(res["status"], "not_found")
            self.assertEqual(res["returncode"], 1)

    def test_default_gcs_runner_classifies_403_as_error(self):
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(
                returncode=1,
                stderr="ERROR: (gcloud.storage.objects.describe) HTTPStatus 403: AccessDenied",
                stdout="",
            )
            res = cleanup.default_gcs_runner("describe", cleanup.BUCKET, "some/key.pdf")
            self.assertEqual(res["status"], "error")
            self.assertEqual(res["error_type"], "permission_or_network")

    def _create_valid_target(self):
        logical = list(cleanup.CANONICAL_OWNED_OBJECTS.keys())[0]
        canonical = cleanup.CANONICAL_OWNED_OBJECTS[logical]
        return {
            "bucket": cleanup.BUCKET,
            "key": cleanup.logical_to_physical_gcs_key(logical),
            "logical_key": logical,
            "documentId": canonical["documentId"],
            "confirmSubmissionId": canonical["confirmSubmissionId"],
            "expected_size": 327,
            "expected_content_type": "application/pdf",
            "authority_established": True,
            "expected_sha256": cleanup.EXPECTED_SHA256,
            "run_bounds": {"start": "2026-10-09T09:01:12Z", "end": "2026-10-09T09:04:01Z"},
        }

    def test_preexisting_absence_without_receipt_raises(self):
        target = self._create_valid_target()
        desc = {"status": "not_found", "returncode": 1, "stderr": "No such object"}
        with self.assertRaises(ValueError) as ctx:
            cleanup.inspect_and_validate_gcs_target(desc, target, prior_receipts=None)
        self.assertIn("Pre-existing absence", str(ctx.exception))

    def test_gcs_metadata_naive_timestamp_rejected(self):
        target = self._create_valid_target()
        target["run_bounds"] = {"start": cleanup.EXPECTED_RUN_BOUNDS_START, "end": cleanup.EXPECTED_RUN_BOUNDS_END}
        desc = {
            "status": "ok",
            "metadata": {
                "bucket": cleanup.BUCKET,
                "name": target["key"],
                "generation": "1728464600123456",
                "metageneration": "1",
                "size": 327,
                "contentType": "application/pdf",
                "sha256": cleanup.EXPECTED_SHA256,
                "timeCreated": "2026-10-09T09:03:18.572", # Naive
            },
        }
        with self.assertRaises(ValueError) as ctx:
            cleanup.inspect_and_validate_gcs_target(desc, target)
        self.assertIn("Naive timestamp", str(ctx.exception))

    def test_exported_pipeline_with_untrusted_inventory_blocks(self):
        inv = create_authentic_inventory()
        inv["run_bounds"] = {"start": "2026-10-09T09:01:12Z", "end": "2026-10-09T09:05:00Z"}
        with self.assertRaises(ValueError):
            cleanup.build_cleanup_plan(inv, mode="dry-run")

    def test_gcs_metadata_bad_content_type_rejected(self):
        target = self._create_valid_target()
        desc = {
            "status": "ok",
            "metadata": {
                "bucket": cleanup.BUCKET,
                "name": target["key"],
                "generation": "1728464600123456",
                "metageneration": "1",
                "size": 327,
                "contentType": "text/plain",  # BAD MIME!
                "sha256": cleanup.EXPECTED_SHA256,
            },
        }
        with self.assertRaises(ValueError) as ctx:
            cleanup.inspect_and_validate_gcs_target(desc, target)
        self.assertIn("content-type mismatch", str(ctx.exception))

    def test_gcs_metadata_bad_hash_rejected(self):
        target = self._create_valid_target()
        desc = {
            "status": "ok",
            "metadata": {
                "bucket": cleanup.BUCKET,
                "name": target["key"],
                "generation": "1728464600123456",
                "metageneration": "1",
                "size": 327,
                "contentType": "application/pdf",
                "sha256": "badhash000000000000000000000000000000000000000000000000000000000",
                "timeCreated": "2026-10-09T09:03:18.572Z",
            },
        }
        with self.assertRaises(ValueError) as ctx:
            cleanup.inspect_and_validate_gcs_target(desc, target)
        self.assertIn("Missing live hash/body verification", str(ctx.exception))

    def test_gcs_metadata_non_numeric_generation_rejected(self):
        target = self._create_valid_target()
        desc = {
            "status": "ok",
            "metadata": {
                "bucket": cleanup.BUCKET,
                "name": target["key"],
                "generation": "not-numeric",
                "metageneration": "1",
                "size": 327,
                "contentType": "application/pdf",
            },
        }
        with self.assertRaises(ValueError) as ctx:
            cleanup.inspect_and_validate_gcs_target(desc, target)
        self.assertIn("non-numeric generation", str(ctx.exception))

    def test_inspector_unowned_target_rejected(self):
        target = self._create_valid_target()
        target["logical_key"] = "foreign-partner/some-other-file.pdf"
        desc = {"status": "not_found", "returncode": 1, "stderr": "No such object"}
        with self.assertRaises(ValueError) as ctx:
            cleanup.inspect_and_validate_gcs_target(desc, target)
        self.assertIn("Foreign object key expected", str(ctx.exception))


class TestDbCleanupGuardsAndPreflight(unittest.TestCase):
    def setUp(self):
        self.plan_dry = cleanup.build_cleanup_plan(create_authentic_inventory(), mode="dry-run")
        self.plan_apply = cleanup.build_cleanup_plan(create_authentic_inventory(), mode="apply")

    def test_dry_run_never_executes_delete(self):
        # A typed positive returns a valid integer count > 0 (e.g., 4 or 8)
        def typed_positive_db(sql, params):
            if "fleet.supply_review_events" in sql:
                return {"status": "ok", "rows_affected": 0, "count": 0}
            return {"status": "ok", "rows_affected": 0, "count": 8 if "supply_documents" in sql else 4}
            
        mock_db = MagicMock(side_effect=typed_positive_db)
        res = cleanup.execute_db_cleanup(self.plan_dry, db_runner=mock_db)
        self.assertEqual(res["status"], "blocked")
        # Verify mock_db was only called with SELECT statements, NEVER DELETE
        for call_args in mock_db.call_args_list:
            sql = call_args[0][0]
            self.assertTrue(sql.startswith("SELECT"), f"Unexpected non-SELECT SQL in dry-run: {sql}")

    def test_db_dry_run_inspection_missing_count_blocks(self):
        def missing_count_db(sql, params):
            if "fleet.supply_review_events" in sql:
                return {"status": "ok", "rows_affected": 0, "count": 0}
            return {"status": "ok", "rows_affected": 0} # no count
            
        mock_db = MagicMock(side_effect=missing_count_db)
        res = cleanup.execute_db_cleanup(self.plan_dry, db_runner=mock_db)
        self.assertEqual(res["status"], "blocked")
        self.assertIn("missing or invalid nonnegative integer", res["concrete_blocker"])

    def test_db_dry_run_inspection_negative_count_blocks(self):
        def negative_count_db(sql, params):
            if "fleet.supply_review_events" in sql:
                return {"status": "ok", "rows_affected": 0, "count": 0}
            return {"status": "ok", "rows_affected": 0, "count": -1}
            
        mock_db = MagicMock(side_effect=negative_count_db)
        res = cleanup.execute_db_cleanup(self.plan_dry, db_runner=mock_db)
        self.assertEqual(res["status"], "blocked")
        self.assertIn("missing or invalid nonnegative integer", res["concrete_blocker"])

    def test_db_dry_run_inspection_zero_count_blocks(self):
        def zero_count_db(sql, params):
            return {"status": "ok", "rows_affected": 0, "count": 0}
            
        mock_db = MagicMock(side_effect=zero_count_db)
        res = cleanup.execute_db_cleanup(self.plan_dry, db_runner=mock_db)
        self.assertEqual(res["status"], "blocked")
        self.assertIn("Zero count returned", res["concrete_blocker"])


    def test_apply_mode_pipeline_halts_before_gcs_mutation_when_db_blocked(self):
        inv = create_authentic_inventory()
        # gcs runner that should NEVER be called for delete
        mock_gcs = MagicMock()
        res = cleanup.run_cleanup_pipeline(
            inv, mode="apply", gcs_runner=mock_gcs, db_runner=None
        )
        self.assertEqual(res["status"], "error")
        self.assertEqual(res["error"], "Unsafe exported apply is unconditionally disabled per security review.")
        self.assertFalse(res["applied"])
        # Verify GCS was never called to delete
        mock_gcs.assert_not_called()


class TestCliEnforcement(unittest.TestCase):
    def test_cli_rejects_mismatched_source_sha(self):
        with tempfile.NamedTemporaryFile("w", encoding="utf-8") as tf:
            json.dump(create_authentic_inventory(), tf)
            tf.flush()
            with patch("sys.stderr"), patch("sys.stdout"):
                code = cleanup.main([
                    "--inventory", tf.name,
                    "--source-sha", "0000000000000000000000000000000000000000",
                ])
            self.assertEqual(code, 1)

    def test_cli_rejects_mismatched_run_id(self):
        with tempfile.NamedTemporaryFile("w", encoding="utf-8") as tf:
            json.dump(create_authentic_inventory(), tf)
            tf.flush()
            with patch("sys.stderr"), patch("sys.stdout"):
                code = cleanup.main([
                    "--inventory", tf.name,
                    "--run-id", "12345",
                ])
            self.assertEqual(code, 1)

    def test_cli_offline_dry_run_succeeds(self):
        with tempfile.NamedTemporaryFile("w", encoding="utf-8") as tf:
            json.dump(create_authentic_inventory(), tf)
            tf.flush()
            with patch("sys.stderr"), patch("sys.stdout"):
                code = cleanup.main([
                    "--inventory", tf.name,
                    "--mode", "dry-run",
                    "--offline",
                ])
            self.assertEqual(code, 0)

    def test_cli_apply_with_unconnected_db_returns_nonzero(self):
        with tempfile.NamedTemporaryFile("w", encoding="utf-8") as tf:
            json.dump(create_authentic_inventory(), tf)
            tf.flush()
            with patch("sys.stderr"), patch("sys.stdout"):
                # In apply mode without an authorized DB runner, must exit 1
                code = cleanup.main([
                    "--inventory", tf.name,
                    "--mode", "apply",
                ])
            self.assertEqual(code, 1)


class TestRound3SecurityInvariantsAndRegressions(unittest.TestCase):
    def test_physical_key_mapping(self):
        logical = "fleet-partner/fleet-demo-001/supply-submissions/8b7b0b8a-bc5a-48f3-b576-af201e6ba074/18f06410-510c-4107-ae21-16ab61383b95-harmless-upload.pdf"
        physical = cleanup.logical_to_physical_gcs_key(logical)
        self.assertTrue(physical.startswith("document-artifacts/fleet-upload-content/"))
        self.assertIn("fleet-partner%2Ffleet-demo-001", physical)
        self.assertNotIn("/supply-submissions/", physical[len("document-artifacts/fleet-upload-content/"):])

    def test_plan_gcs_targets_contain_physical_and_logical_keys(self):
        plan = cleanup.build_cleanup_plan(create_authentic_inventory(), mode="dry-run")
        targets = plan["gcs_targets"]
        self.assertEqual(len(targets), 8)
        for t in targets:
            self.assertEqual(t["key"], t["physical_key"])
            self.assertTrue(t["key"].startswith("document-artifacts/fleet-upload-content/"))
            self.assertTrue(t["logical_key"].startswith(cleanup.KEY_PREFIX))

    def test_db_dry_run_inspection_error_blocks(self):
        plan = cleanup.build_cleanup_plan(create_authentic_inventory(), mode="dry-run")
        def err_db(sql, params):
            return {"status": "error", "error": "permission denied"}
        res = cleanup.execute_db_cleanup(plan, db_runner=err_db)
        self.assertEqual(res["status"], "error")
        self.assertIn("permission denied", res["error"])

    def _create_valid_target(self):
        logical = list(cleanup.CANONICAL_OWNED_OBJECTS.keys())[0]
        canonical = cleanup.CANONICAL_OWNED_OBJECTS[logical]
        return {
            "bucket": cleanup.BUCKET,
            "key": cleanup.logical_to_physical_gcs_key(logical),
            "logical_key": logical,
            "documentId": canonical["documentId"],
            "confirmSubmissionId": canonical["confirmSubmissionId"],
            "expected_size": 327,
            "expected_content_type": "application/pdf",
            "authority_established": True,
            "expected_sha256": cleanup.EXPECTED_SHA256,
            "run_bounds": {"start": "2026-10-09T09:01:12Z", "end": "2026-10-09T09:04:01Z"},
        }

    def test_gcs_target_missing_metageneration_rejected(self):
        target = self._create_valid_target()
        desc = {
            "status": "ok",
            "metadata": {
                "bucket": cleanup.BUCKET,
                "name": target["key"],
                "generation": "1728464600123456",
                "size": 327,
                "contentType": "application/pdf",
                "sha256": cleanup.EXPECTED_SHA256,
                "timeCreated": "2026-10-09T09:03:18.572Z",
            },
        }
        with self.assertRaises(ValueError) as ctx:
            cleanup.inspect_and_validate_gcs_target(desc, target)
        self.assertIn("Missing or invalid metageneration", str(ctx.exception))

    def test_gcs_target_missing_hash_and_body_rejected(self):
        target = self._create_valid_target()
        desc = {
            "status": "ok",
            "metadata": {
                "bucket": cleanup.BUCKET,
                "name": target["key"],
                "generation": "1728464600123456",
                "metageneration": "1",
                "size": 327,
                "contentType": "application/pdf",
                "timeCreated": "2026-10-09T09:03:18.572Z",
            },
        }
        with self.assertRaises(ValueError) as ctx:
            cleanup.inspect_and_validate_gcs_target(desc, target)
        self.assertIn("Missing live hash/body verification", str(ctx.exception))

    def test_gcs_target_stale_timestamp_rejected(self):
        target = self._create_valid_target()
        desc = {
            "status": "ok",
            "metadata": {
                "bucket": cleanup.BUCKET,
                "name": target["key"],
                "generation": "1728464600123456",
                "metageneration": "1",
                "size": 327,
                "contentType": "application/pdf",
                "sha256": cleanup.EXPECTED_SHA256,
                "timeCreated": "2000-01-01T00:00:00Z",
            },
        }
        with self.assertRaises(ValueError) as ctx:
            cleanup.inspect_and_validate_gcs_target(desc, target)
        self.assertIn("out of bounds", str(ctx.exception))

    def test_gcs_target_prior_receipt_validation(self):
        target = self._create_valid_target()
        desc = {"status": "not_found", "returncode": 1, "stderr": "Not found"}
        foreign_receipt = [{"key": target["key"], "bucket": "wrong-bucket", "status": "deleted", "generation": "123", "verified_absent": True}]
        with self.assertRaises(ValueError) as ctx:
            cleanup.inspect_and_validate_gcs_target(desc, target, prior_receipts=foreign_receipt)
        self.assertIn("Pre-existing absence", str(ctx.exception))

        garbage_gen_receipt = [{"key": target["key"], "bucket": cleanup.BUCKET, "status": "deleted", "generation": "garbage", "verified_absent": True}]
        with self.assertRaises(ValueError) as ctx:
            cleanup.inspect_and_validate_gcs_target(desc, target, prior_receipts=garbage_gen_receipt)
        self.assertIn("Pre-existing absence", str(ctx.exception))

        valid_receipt = [{"key": target["key"], "bucket": cleanup.BUCKET, "status": "deleted", "generation": "1728464600123456", "verified_absent": True}]
        with self.assertRaises(ValueError) as ctx:
            cleanup.inspect_and_validate_gcs_target(desc, target, prior_receipts=valid_receipt)
        self.assertIn("authoritative authenticated", str(ctx.exception))

    def test_all_preflights_before_mutation_halts_db_on_gcs_failure(self):
        trace = []
        inv = create_authentic_inventory()
        def good_db(sql, params):
            trace.append("DB " + sql)
            if sql in ("BEGIN", "COMMIT"):
                return {"status": "ok"}
            if sql.startswith("SELECT"):
                return {"status": "ok", "count": 0}
            return {"status": "ok", "rows_affected": 8 if "supply_documents" in sql else 4}

        def bad_first_gcs(action, bucket, key, generation=None):
            trace.append("GCS " + action)
            return {"status": "ok", "metadata": {"bucket": cleanup.BUCKET, "name": key, "generation": "123", "metageneration": "1", "size": 327, "contentType": "text/plain", "sha256": cleanup.EXPECTED_SHA256, "timeCreated": "2026-10-09T09:03:18.572Z"}}

        with self.assertRaises(ValueError) as ctx:
            cleanup.run_cleanup_pipeline(inv, mode="dry-run", gcs_runner=bad_first_gcs, db_runner=good_db)
        self.assertIn("content-type mismatch", str(ctx.exception))
        self.assertEqual(sum(x.startswith("DB DELETE") for x in trace), 0)


if __name__ == "__main__":
    unittest.main()
