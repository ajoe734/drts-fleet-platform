import unittest
import json
import hashlib
import importlib.util
from unittest.mock import patch, MagicMock
import sys
from pathlib import Path
import os
import io
import zipfile
import tempfile
import argparse

script_dir = Path(__file__).resolve().parent
operations_dir = script_dir.parent.parent.parent / "operations" / "verification"
sys.path.insert(0, str(operations_dir))

module_name = "assess_owned_operational_fixtures"
file_path = operations_dir / "assess-owned-operational-fixtures.py"
spec = importlib.util.spec_from_file_location(module_name, file_path)
assess = importlib.util.module_from_spec(spec)
sys.modules[module_name] = assess
spec.loader.exec_module(assess)

PDF_BYTES = (
    b"%PDF-1.4\n"
    b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
    b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
    b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 72] >>\nendobj\n"
    b"xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n"
    b"trailer\n<< /Size 4 /Root 1 0 R >>\n"
    b"startxref\n184\n%%EOF\n"
)

class TestAssessOwnedOperationalFixtures(unittest.TestCase):
    def setUp(self):
        self.expected_sha256 = assess.EXPECTED_SHA256
        self.expected_size = assess.EXPECTED_FILE_SIZE
        self.expected_mime = assess.EXPECTED_MIME

    def test_logical_to_physical_key(self):
        logical = "fleet-partner/fleet-demo-001/supply-submissions/uuid/doc.pdf"
        expected = "document-artifacts/fleet-upload-content/fleet-partner%2Ffleet-demo-001%2Fsupply-submissions%2Fuuid%2Fdoc.pdf"
        self.assertEqual(assess.logical_to_physical_gcs_key(logical), expected)

    def test_assess_gcs_objects_success(self):
        def mock_gcs_runner(action, bucket, key):
            if action == "describe":
                return {
                    "status": "ok",
                    "metadata": {
                        "size": str(self.expected_size),
                        "contentType": self.expected_mime,
                        "generation": "1234567890",
                        "metageneration": "1",
                        "timeCreated": "2026-10-09T09:03:18.572Z",
                        "updated": "2026-10-09T09:03:18.572Z"
                    }
                }
            elif action == "cat":
                return {"status": "ok", "body": PDF_BYTES}
            return {"status": "error"}

        res = assess.assess_gcs_objects(mock_gcs_runner)
        self.assertEqual(res["status"], "success")
        self.assertEqual(res["validated_count"], len(assess.CANONICAL_OWNED_OBJECTS))

    def test_assess_gcs_objects_drift(self):
        describe_calls = {"count": 0}
        def mock_gcs_runner(action, bucket, key):
            if action == "describe":
                describe_calls["count"] += 1
                gen = "1234567890" if describe_calls["count"] <= 8 else "0987654321"
                return {
                    "status": "ok",
                    "metadata": {
                        "size": str(self.expected_size),
                        "contentType": self.expected_mime,
                        "generation": gen,
                        "metageneration": "1",
                        "timeCreated": "2026-10-09T09:03:18.572Z",
                        "updated": "2026-10-09T09:03:18.572Z"
                    }
                }
            elif action == "cat":
                return {"status": "ok", "body": PDF_BYTES}
            return {"status": "error"}

        res = assess.assess_gcs_objects(mock_gcs_runner)
        self.assertEqual(res["status"], "rejected")
        self.assertIn("Generation drift", res["reason"])

    def test_assess_gcs_objects_missing_object(self):
        def mock_gcs_runner(action, bucket, key):
            if action == "describe":
                return {"status": "not_found"}
            return {"status": "error"}

        res = assess.assess_gcs_objects(mock_gcs_runner)
        self.assertEqual(res["status"], "rejected")
        self.assertIn("Missing object", res["reason"])

    def test_assess_database_success(self):
        def mock_db_runner(query, params):
            counts = {
                'subs': 4,
                'docs': 8,
                'revs': 0,
                'affs': 0,
                'discs': 0,
                'creds': 0
            }
            return {"rows": [[json.dumps(counts)]]}

        res = assess.assess_database(mock_db_runner)
        self.assertEqual(res["status"], "success")
        self.assertEqual(res["submissions_found"], 4)
        self.assertEqual(res["documents_found"], 8)

    def test_assess_database_missing_subs(self):
        def mock_db_runner(query, params):
            counts = {
                'subs': 3,
                'docs': 8,
                'revs': 0,
                'affs': 0,
                'discs': 0,
                'creds': 0
            }
            return {"rows": [[json.dumps(counts)]]}

        res = assess.assess_database(mock_db_runner)
        self.assertEqual(res["status"], "rejected")
        self.assertIn("Missing expected supply_submissions", res["reason"])

    def test_assess_database_has_refs(self):
        def mock_db_runner(query, params):
            counts = {
                'subs': 4,
                'docs': 8,
                'revs': 2,
                'affs': 0,
                'discs': 0,
                'creds': 0
            }
            return {"rows": [[json.dumps(counts)]]}

        res = assess.assess_database(mock_db_runner)
        self.assertEqual(res["status"], "rejected")
        self.assertIn("inbound foreign keys exist", res["concrete_blocker"])
        
    def test_provenance_validation(self):
        args = argparse.Namespace(
            mock_db=False,
            product_run_id=assess.AUTHORIZED_PROVENANCE["run_id"],
            artifact_id=assess.AUTHORIZED_PROVENANCE["artifact_id"],
            source_sha=assess.AUTHORIZED_PROVENANCE["source_sha"],
            workflow_def_sha=assess.AUTHORIZED_PROVENANCE["workflow_sha"],
        )
        def mock_subprocess_run(cmd, **kwargs):
            if cmd[:2] == ["gh", "api"] and len(cmd) > 2 and "zip" in cmd[2]:
                zip_path = kwargs.get("stdout").name
                with zipfile.ZipFile(zip_path, 'w') as zf:
                    evidence = {"evidence": []}
                    for logical_key in assess.CANONICAL_OWNED_OBJECTS.keys():
                        evidence["evidence"].append({
                            "kind": "setup-document-upload",
                            "objectKey": logical_key,
                            "candidateSha": assess.AUTHORIZED_PROVENANCE["source_sha"],
                            "intentStatus": 201,
                            "confirmStatus": 201,
                            "readbackFileSize": assess.EXPECTED_FILE_SIZE,
                            "readbackContentType": assess.EXPECTED_MIME,
                            "readbackSha256": assess.EXPECTED_SHA256,
                        })
                    zf.writestr("operational-browser-evidence.json", json.dumps(evidence))
                return MagicMock(returncode=0)
            return MagicMock(returncode=1)
            
        with patch("subprocess.run", side_effect=mock_subprocess_run):
            with self.assertRaisesRegex(ValueError, "Archive hash mismatch"):
                assess.fetch_and_validate_provenance(args)

if __name__ == '__main__':
    unittest.main()
