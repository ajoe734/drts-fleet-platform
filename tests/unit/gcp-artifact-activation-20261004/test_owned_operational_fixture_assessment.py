import unittest
import json
import hashlib
import importlib.util
from unittest.mock import patch, MagicMock
import sys
from pathlib import Path

script_dir = Path(__file__).resolve().parent
operations_dir = script_dir.parent.parent.parent / "operations" / "verification"
sys.path.insert(0, str(operations_dir))

# Load module dynamically because of hyphens in filename
module_name = "assess_owned_operational_fixtures"
file_path = operations_dir / "assess-owned-operational-fixtures.py"
spec = importlib.util.spec_from_file_location(module_name, file_path)
assess = importlib.util.module_from_spec(spec)
sys.modules[module_name] = assess
spec.loader.exec_module(assess)

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
                        "metageneration": "1"
                    }
                }
            elif action == "cat":
                return {"status": "ok", "body": b"fake_body"}
            return {"status": "error"}

        with patch('hashlib.sha256') as mock_hash:
            mock_sha = MagicMock()
            mock_sha.hexdigest.return_value = self.expected_sha256
            mock_hash.return_value = mock_sha
            
            res = assess.assess_gcs_objects(mock_gcs_runner)
            self.assertEqual(res["status"], "success")
            self.assertEqual(res["validated_count"], len(assess.CANONICAL_OWNED_OBJECTS))

    def test_assess_gcs_objects_missing_object(self):
        def mock_gcs_runner(action, bucket, key):
            if action == "describe":
                return {"status": "not_found"}
            return {"status": "error"}

        with self.assertRaisesRegex(ValueError, "Missing object"):
            assess.assess_gcs_objects(mock_gcs_runner)

    def test_assess_gcs_objects_size_mismatch(self):
        def mock_gcs_runner(action, bucket, key):
            if action == "describe":
                return {
                    "status": "ok",
                    "metadata": {
                        "size": "999", 
                        "contentType": self.expected_mime,
                        "generation": "1234567890",
                        "metageneration": "1"
                    }
                }
            return {"status": "error"}

        with self.assertRaisesRegex(ValueError, "Size mismatch"):
            assess.assess_gcs_objects(mock_gcs_runner)

    def test_assess_database_success(self):
        def mock_db_runner(query, params):
            if "supply_submissions" in query:
                return {"rows": [["4"]]}
            elif "supply_review_events" in query:
                return {"rows": [["10"]]}
            elif "vehicle_fleet_affiliations" in query:
                return {"rows": [["2"]]}
            return {"rows": [["0"]]}

        res = assess.assess_database(mock_db_runner)
        self.assertEqual(res["status"], "success")
        self.assertEqual(res["submissions_found"], 4)
        self.assertEqual(res["review_events_count"], 10)
        self.assertEqual(res["affiliations_count"], 2)

    def test_assess_database_missing_submissions(self):
        def mock_db_runner(query, params):
            if "supply_submissions" in query:
                return {"rows": [["3"]]} 
            return {"rows": [["0"]]}

        with self.assertRaisesRegex(ValueError, "Missing expected supply_submissions"):
            assess.assess_database(mock_db_runner)

if __name__ == '__main__':
    unittest.main()
