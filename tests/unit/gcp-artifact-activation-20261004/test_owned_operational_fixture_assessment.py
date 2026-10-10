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

    def tearDown(self):
        pass

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
                        "bucket": assess.BUCKET,
                        "name": key,
                        "size": str(self.expected_size),
                        "contentType": self.expected_mime,
                        "generation": "1234567890",
                        "metageneration": "1",
                        "timeCreated": "2026-10-09T09:03:18.572Z",
                        "updated": "2026-10-09T09:03:18.572Z",
                        "metadata": {
                            "stored-at": "2026-10-09T09:03:18.572Z"
                        }
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
                        "bucket": assess.BUCKET,
                        "name": key,
                        "size": str(self.expected_size),
                        "contentType": self.expected_mime,
                        "generation": gen,
                        "metageneration": "1",
                        "timeCreated": "2026-10-09T09:03:18.572Z",
                        "updated": "2026-10-09T09:03:18.572Z",
                        "metadata": {
                            "stored-at": "2026-10-09T09:03:18.572Z"
                        }
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
                'subs': [{"id": u, "status": "approved", "fleet_partner_id": "fleet-demo-001", "revision_no": 1, "created_at": "2026-10-09T08:39:23Z", "submission_id": u} for u in assess.CANONICAL_OWNED_SUBMISSIONS],
                'docs': [{"id": expected["documentId"], "submission_id": expected["confirmSubmissionId"], "fleet_partner_id": "fleet-demo-001", "file_object_key": logical_key, "checksum_sha256": assess.EXPECTED_SHA256, "document_type": expected["document_type"], "uploaded_at": "2026-10-09T08:40:00Z", "file_size": assess.EXPECTED_FILE_SIZE, "content_type": assess.EXPECTED_MIME} for logical_key, expected in assess.CANONICAL_OWNED_OBJECTS.items()],
                'revs': 0,
                'affs': 0,
                'discs': 0,
                'creds': 0,
                'cdriv': 0,
                'cveh': 0,
                'cpol': 0,
                'ccont': 0,
                'ddrafts': 0,
                'vdrafts': 0,
                'fks_meta': [{"rel": "fleet.supply_documents", "confrel": "fleet.supply_submissions", "name": "c1", "contype": "f", "confdeltype": "c"}, {"rel": "fleet.supply_review_events", "confrel": "fleet.supply_submissions", "name": "c2", "contype": "f", "confdeltype": "a"}, {"rel": "fleet.vehicle_fleet_affiliations", "confrel": "fleet.supply_submissions", "name": "c3", "contype": "f", "confdeltype": "a"}, {"rel": "fleet.driver_supply_drafts", "confrel": "fleet.supply_submissions", "name": "c4", "contype": "f", "confdeltype": "c"}, {"rel": "fleet.vehicle_supply_drafts", "confrel": "fleet.supply_submissions", "name": "c5", "contype": "f", "confdeltype": "c"}],
                'pres_subs': {"c": 4, "digest": "12345678901234567890123456789012"},
                'pres_docs': {"c": 8, "digest": "12345678901234567890123456789012"},
                'pres_revs': {"c": 0, "digest": "12345678901234567890123456789012"},
                'pres_affs': {"c": 0, "digest": "12345678901234567890123456789012"},
                'pres_discs': {"c": 0, "digest": "12345678901234567890123456789012"},
                'pres_creds': {"c": 0, "digest": "12345678901234567890123456789012"},
                'pres_cdriv': {"c": 0, "digest": "12345678901234567890123456789012"},
                'pres_cveh': {"c": 0, "digest": "12345678901234567890123456789012"},
                'pres_cpol': {"c": 0, "digest": "12345678901234567890123456789012"},
                'pres_ccont': {"c": 0, "digest": "12345678901234567890123456789012"},
                'pres_ddrafts': {"c": 0, "digest": "12345678901234567890123456789012"},
                'pres_vdrafts': {"c": 0, "digest": "12345678901234567890123456789012"},
                'tx_ro': 'on',
                'tx_iso': 'repeatable read'
            }
            return {"rows": [[json.dumps(counts)]]}

        res = assess.assess_database(mock_db_runner)
        self.assertEqual(res["status"], "success")
        self.assertEqual(res["submissions_found"], 4)
        self.assertEqual(res["documents_found"], 8)

    def test_assess_database_missing_subs(self):
        def mock_db_runner(query, params):
            counts = {
                'subs': [{"id": assess.CANONICAL_OWNED_SUBMISSIONS[0], "status": "approved", "fleet_partner_id": "fleet-demo-001", "revision_no": 1, "created_at": "2026-10-09T08:39:23Z", "submission_id": assess.CANONICAL_OWNED_SUBMISSIONS[0]}],
                'docs': [{"id": expected["documentId"], "submission_id": expected["confirmSubmissionId"], "fleet_partner_id": "fleet-demo-001", "file_object_key": logical_key, "checksum_sha256": assess.EXPECTED_SHA256, "document_type": expected["document_type"], "uploaded_at": "2026-10-09T08:40:00Z", "file_size": assess.EXPECTED_FILE_SIZE, "content_type": assess.EXPECTED_MIME} for logical_key, expected in assess.CANONICAL_OWNED_OBJECTS.items()],
                'revs': 0,
                'affs': 0,
                'discs': 0,
                'creds': 0,
                'cdriv': 0,
                'cveh': 0,
                'cpol': 0,
                'ccont': 0,
                'ddrafts': 0,
                'vdrafts': 0,
                'fks_meta': [{"rel": "fleet.supply_documents", "confrel": "fleet.supply_submissions", "name": "c1", "contype": "f", "confdeltype": "c"}, {"rel": "fleet.supply_review_events", "confrel": "fleet.supply_submissions", "name": "c2", "contype": "f", "confdeltype": "a"}, {"rel": "fleet.vehicle_fleet_affiliations", "confrel": "fleet.supply_submissions", "name": "c3", "contype": "f", "confdeltype": "a"}, {"rel": "fleet.driver_supply_drafts", "confrel": "fleet.supply_submissions", "name": "c4", "contype": "f", "confdeltype": "c"}, {"rel": "fleet.vehicle_supply_drafts", "confrel": "fleet.supply_submissions", "name": "c5", "contype": "f", "confdeltype": "c"}],
                'pres_subs': {"c": 4, "digest": "12345678901234567890123456789012"},
                'pres_docs': {"c": 8, "digest": "12345678901234567890123456789012"},
                'pres_revs': {"c": 0, "digest": "12345678901234567890123456789012"},
                'pres_affs': {"c": 0, "digest": "12345678901234567890123456789012"},
                'pres_discs': {"c": 0, "digest": "12345678901234567890123456789012"},
                'pres_creds': {"c": 0, "digest": "12345678901234567890123456789012"},
                'pres_cdriv': {"c": 0, "digest": "12345678901234567890123456789012"},
                'pres_cveh': {"c": 0, "digest": "12345678901234567890123456789012"},
                'pres_cpol': {"c": 0, "digest": "12345678901234567890123456789012"},
                'pres_ccont': {"c": 0, "digest": "12345678901234567890123456789012"},
                'pres_ddrafts': {"c": 0, "digest": "12345678901234567890123456789012"},
                'pres_vdrafts': {"c": 0, "digest": "12345678901234567890123456789012"},
                'tx_ro': 'on',
                'tx_iso': 'repeatable read'
            }
            return {"rows": [[json.dumps(counts)]]}

        res = assess.assess_database(mock_db_runner)
        self.assertEqual(res["status"], "rejected")
        self.assertIn("Missing expected supply_submissions", res["reason"])

    def test_assess_database_has_refs(self):
        def mock_db_runner(query, params):
            counts = {
                'subs': [{"id": u, "status": "approved", "fleet_partner_id": "fleet-demo-001", "revision_no": 1, "created_at": "2026-10-09T08:39:23Z", "submission_id": u} for u in assess.CANONICAL_OWNED_SUBMISSIONS],
                'docs': [{"id": expected["documentId"], "submission_id": expected["confirmSubmissionId"], "fleet_partner_id": "fleet-demo-001", "file_object_key": logical_key, "checksum_sha256": assess.EXPECTED_SHA256, "document_type": expected["document_type"], "uploaded_at": "2026-10-09T08:40:00Z", "file_size": assess.EXPECTED_FILE_SIZE, "content_type": assess.EXPECTED_MIME} for logical_key, expected in assess.CANONICAL_OWNED_OBJECTS.items()],
                'revs': 2,
                'affs': 0,
                'discs': 0,
                'creds': 0,
                'cdriv': 0,
                'cveh': 0,
                'cpol': 0,
                'ccont': 0,
                'ddrafts': 0,
                'vdrafts': 0,
                'fks_meta': [{"rel": "fleet.supply_documents", "confrel": "fleet.supply_submissions", "name": "c1", "contype": "f", "confdeltype": "c"}, {"rel": "fleet.supply_review_events", "confrel": "fleet.supply_submissions", "name": "c2", "contype": "f", "confdeltype": "a"}, {"rel": "fleet.vehicle_fleet_affiliations", "confrel": "fleet.supply_submissions", "name": "c3", "contype": "f", "confdeltype": "a"}, {"rel": "fleet.driver_supply_drafts", "confrel": "fleet.supply_submissions", "name": "c4", "contype": "f", "confdeltype": "c"}, {"rel": "fleet.vehicle_supply_drafts", "confrel": "fleet.supply_submissions", "name": "c5", "contype": "f", "confdeltype": "c"}],
                'pres_subs': {"c": 4, "digest": "12345678901234567890123456789012"},
                'pres_docs': {"c": 8, "digest": "12345678901234567890123456789012"},
                'pres_revs': {"c": 0, "digest": "12345678901234567890123456789012"},
                'pres_affs': {"c": 0, "digest": "12345678901234567890123456789012"},
                'pres_discs': {"c": 0, "digest": "12345678901234567890123456789012"},
                'pres_creds': {"c": 0, "digest": "12345678901234567890123456789012"},
                'pres_cdriv': {"c": 0, "digest": "12345678901234567890123456789012"},
                'pres_cveh': {"c": 0, "digest": "12345678901234567890123456789012"},
                'pres_cpol': {"c": 0, "digest": "12345678901234567890123456789012"},
                'pres_ccont': {"c": 0, "digest": "12345678901234567890123456789012"},
                'pres_ddrafts': {"c": 0, "digest": "12345678901234567890123456789012"},
                'pres_vdrafts': {"c": 0, "digest": "12345678901234567890123456789012"},
                'tx_ro': 'on',
                'tx_iso': 'repeatable read'
            }
            return {"rows": [[json.dumps(counts)]]}

        res = assess.assess_database(mock_db_runner)
        self.assertEqual(res["status"], "rejected")
        self.assertIn("2 review_events exist", res["concrete_blocker"])
        
    def test_provenance_validation_negative(self):
        args = MagicMock()
        args.mock_db = False
        args.product_run_id = assess.AUTHORIZED_PROVENANCE["run_id"]
        args.artifact_id = assess.AUTHORIZED_PROVENANCE["artifact_id"]
        args.source_sha = "wrong-sha"
        args.workflow_def_sha = assess.AUTHORIZED_PROVENANCE["workflow_sha"]
        
        with self.assertRaisesRegex(Exception, "Unauthorized source_sha"):
            assess.fetch_and_validate_provenance(args)

    def test_provenance_validation_success(self):
        # Use genuine local fixture for transport-only mocks
        local_fixture_dir = Path(__file__).resolve().parent.parent.parent / "fixtures" / "operational-fixture-assessment"
        if not local_fixture_dir.exists():
            self.skipTest("Local test fixture not found")
            
        args = MagicMock()
        args.mock_db = False
        args.product_run_id = assess.AUTHORIZED_PROVENANCE["run_id"]
        args.artifact_id = assess.AUTHORIZED_PROVENANCE["artifact_id"]
        args.source_sha = assess.AUTHORIZED_PROVENANCE["source_sha"]
        args.workflow_def_sha = assess.AUTHORIZED_PROVENANCE["workflow_sha"]
        
        with open(local_fixture_dir / "run.json", "r") as f:
            run_data = f.read()
        with open(local_fixture_dir / "jobs.json", "r") as f:
            jobs_data = f.read()
        with open(local_fixture_dir / "artifact.json", "r") as f:
            art_data = f.read()
        with open(local_fixture_dir / "artifact-11606165993.zip", "rb") as f:
            zip_bytes = f.read()
            
        def mock_run(cmd, **kwargs):
            cmd_str = " ".join(cmd)
            if "/runs/37906298090/jobs" in cmd_str:
                return MagicMock(returncode=0, stdout=jobs_data)
            elif "/runs/37906298090/artifacts" in cmd_str:
                return MagicMock(returncode=0, stdout=json.dumps({"total_count": 1, "artifacts": [json.loads(art_data)]}))
            elif "/runs/37906298090" in cmd_str:
                return MagicMock(returncode=0, stdout=run_data)
            elif "artifacts/11606165993/zip" in cmd_str:
                return MagicMock(returncode=0, stdout=zip_bytes)
            return MagicMock(returncode=1)
            
        def mock_popen(cmd, **kwargs):
            cmd_str = " ".join(cmd)
            if "artifacts/11606165993/zip" in cmd_str:
                import tempfile, os
                m = MagicMock()
                m.returncode = 0
                fd, path = tempfile.mkstemp()
                os.write(fd, zip_bytes)
                os.lseek(fd, 0, os.SEEK_SET)
                f = open(path, "rb")
                m.stdout = f
                fd2, path2 = tempfile.mkstemp()
                os.write(fd2, b"")
                os.lseek(fd2, 0, os.SEEK_SET)
                f2 = open(path2, "rb")
                m.stderr = f2
                # keep track of fd to avoid closing issues
                m.poll = lambda: 0
                m.__enter__ = lambda self: self
                m.__exit__ = lambda self, a, b, c: (f.close(), f2.close())
                return m
            return MagicMock(returncode=1)

        with patch("subprocess.run", side_effect=mock_run), patch("subprocess.Popen", side_effect=mock_popen):
            assess.fetch_and_validate_provenance(args)

if __name__ == '__main__':
    unittest.main()
