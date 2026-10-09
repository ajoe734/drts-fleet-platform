"""Unit tests for owned operational fixture cleanup planner & executor.

Executes actual collector/planner/guard code with ONLY external boundaries mocked.
No network requests, zero socket connections, pure Python stdlib.
"""
from __future__ import annotations

import copy
import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

# Dynamically import cleanup module to ensure exact location resolution
MODULE_PATH = Path(__file__).resolve().parent / "cleanup-owned-operational-fixtures.py"
SPEC = importlib.util.spec_from_file_location("cleanup_tool", MODULE_PATH)
cleanup = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(cleanup)

FIXTURE_PATH = (
    Path(__file__).resolve().parents[2]
    / ".local/fleet-storage-diagnosis-20261008/referral-reviewed-composition-dev-deployment-20261009/exact-owned-fixture-inventory.json"
)


def load_authentic_fixture() -> dict:
    if FIXTURE_PATH.is_file():
        with open(FIXTURE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    # Synthetic fallback matching exact authentic structure if path not readable
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
                "documentId": val["document_id"],
                "objectKey": key,
                "fileSize": cleanup.EXPECTED_FILE_SIZE,
                "sha256": cleanup.EXPECTED_SHA256,
                "confirmSubmissionId": val["submission_id"],
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
        self.data = load_authentic_fixture()

    def test_authentic_provenance_passes(self):
        # Must not raise
        cleanup.validate_provenance(
            self.data,
            run_id=cleanup.EXPECTED_PRODUCT_RUN_ID,
            source_sha=cleanup.EXPECTED_SOURCE_SHA,
            definition_sha=cleanup.EXPECTED_WORKFLOW_DEF_SHA,
            artifact_id=cleanup.EXPECTED_ARTIFACT_ID,
        )

    def test_mismatched_run_id_fails_closed(self):
        bad_data = copy.deepcopy(self.data)
        bad_data["run_id"] = 99999999999
        with self.assertRaises(ValueError) as ctx:
            cleanup.validate_provenance(bad_data)
        self.assertIn("Product run ID mismatch", str(ctx.exception))

    def test_mismatched_source_sha_fails_closed(self):
        bad_data = copy.deepcopy(self.data)
        bad_data["source_sha"] = "03a1c98af9bddfacf3feb2b0b9b8bd00283717bf"
        with self.assertRaises(ValueError) as ctx:
            cleanup.validate_provenance(bad_data)
        self.assertIn("Source SHA mismatch", str(ctx.exception))

    def test_invalid_sha_format_fails_closed(self):
        with self.assertRaises(ValueError):
            cleanup.validate_full_sha("not-a-sha")
        with self.assertRaises(ValueError):
            cleanup.validate_full_sha("4A166F3ED2A7000061ACC737EE475AE3C47DCA56")  # uppercase
        with self.assertRaises(ValueError):
            cleanup.validate_full_sha("4a166f3ed2a7")  # short sha

    def test_mismatched_workflow_definition_fails_closed(self):
        bad_data = copy.deepcopy(self.data)
        bad_data["workflow_definition_sha"] = "0000000000000000000000000000000000000000"
        with self.assertRaises(ValueError) as ctx:
            cleanup.validate_provenance(bad_data)
        self.assertIn("Workflow definition SHA mismatch", str(ctx.exception))

    def test_mismatched_artifact_id_fails_closed(self):
        with self.assertRaises(ValueError) as ctx:
            cleanup.validate_provenance(self.data, artifact_id=123456)
        self.assertIn("Artifact ID mismatch", str(ctx.exception))


class TestInventoryValidation(unittest.TestCase):
    def setUp(self):
        self.data = load_authentic_fixture()

    def test_authentic_inventory_passes(self):
        validated = cleanup.validate_inventory_items(self.data)
        self.assertEqual(len(validated), 8)
        keys = [item["object_key"] for item in validated]
        self.assertEqual(set(keys), set(cleanup.CANONICAL_OWNED_OBJECTS.keys()))

    def test_cardinality_fewer_objects_fails_closed(self):
        bad_data = copy.deepcopy(self.data)
        bad_data["storage_documents"] = bad_data["storage_documents"][:7]
        with self.assertRaises(ValueError) as ctx:
            cleanup.validate_inventory_items(bad_data)
        self.assertIn("Expected exactly 8 storage documents, found 7", str(ctx.exception))

    def test_cardinality_extra_objects_fails_closed(self):
        bad_data = copy.deepcopy(self.data)
        extra = copy.deepcopy(bad_data["storage_documents"][0])
        extra["documentId"] = "00000000-0000-0000-0000-000000000001"
        extra["objectKey"] = cleanup.KEY_PREFIX + "sub/extra.pdf"
        bad_data["storage_documents"].append(extra)
        with self.assertRaises(ValueError) as ctx:
            cleanup.validate_inventory_items(bad_data)
        self.assertIn("Expected exactly 8 storage documents, found 9", str(ctx.exception))

    def test_duplicate_document_id_fails_closed(self):
        bad_data = copy.deepcopy(self.data)
        bad_data["storage_documents"][1]["documentId"] = bad_data["storage_documents"][0]["documentId"]
        with self.assertRaises(ValueError) as ctx:
            cleanup.validate_inventory_items(bad_data)
        self.assertIn("Duplicate documentId", str(ctx.exception))

    def test_duplicate_object_key_fails_closed(self):
        bad_data = copy.deepcopy(self.data)
        bad_data["storage_documents"][1]["objectKey"] = bad_data["storage_documents"][0]["objectKey"]
        with self.assertRaises(ValueError) as ctx:
            cleanup.validate_inventory_items(bad_data)
        self.assertIn("Duplicate objectKey", str(ctx.exception))

    def test_path_traversal_in_key_fails_closed(self):
        bad_data = copy.deepcopy(self.data)
        bad_data["storage_documents"][0]["objectKey"] = (
            cleanup.KEY_PREFIX + "8b7b0b8a-bc5a-48f3-b576-af201e6ba074/../traversal.pdf"
        )
        with self.assertRaises(ValueError) as ctx:
            cleanup.validate_inventory_items(bad_data)
        self.assertIn("Path traversal rejected", str(ctx.exception))

    def test_unowned_prefix_fails_closed(self):
        bad_data = copy.deepcopy(self.data)
        bad_data["storage_documents"][0]["objectKey"] = "arbitrary/prefix/harmless-upload.pdf"
        with self.assertRaises(ValueError) as ctx:
            cleanup.validate_inventory_items(bad_data)
        self.assertIn("Key does not match required owned prefix", str(ctx.exception))

    def test_foreign_fleet_partner_fails_closed(self):
        bad_data = copy.deepcopy(self.data)
        bad_data["storage_documents"][0]["confirmFleetPartnerId"] = "foreign-partner-999"
        with self.assertRaises(ValueError) as ctx:
            cleanup.validate_inventory_items(bad_data)
        self.assertIn("Foreign fleetPartnerId", str(ctx.exception))

    def test_size_mismatch_fails_closed(self):
        bad_data = copy.deepcopy(self.data)
        bad_data["storage_documents"][0]["fileSize"] = 328
        with self.assertRaises(ValueError) as ctx:
            cleanup.validate_inventory_items(bad_data)
        self.assertIn("Unexpected file size", str(ctx.exception))

    def test_hash_mismatch_fails_closed(self):
        bad_data = copy.deepcopy(self.data)
        bad_data["storage_documents"][0]["sha256"] = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
        with self.assertRaises(ValueError) as ctx:
            cleanup.validate_inventory_items(bad_data)
        self.assertIn("Unexpected SHA-256 hash", str(ctx.exception))

    def test_content_type_mismatch_fails_closed(self):
        bad_data = copy.deepcopy(self.data)
        bad_data["storage_documents"][0]["readbackContentType"] = "application/json"
        with self.assertRaises(ValueError) as ctx:
            cleanup.validate_inventory_items(bad_data)
        self.assertIn("Unexpected content type", str(ctx.exception))

    def test_missing_preservation_flag_fails_closed(self):
        bad_data = copy.deepcopy(self.data)
        bad_data["preserve_failed_8d_03a_and_user_data"] = False
        with self.assertRaises(ValueError) as ctx:
            cleanup.validate_inventory_items(bad_data)
        self.assertIn("must explicitly declare preserve_failed_8d_03a_and_user_data=True", str(ctx.exception))


class TestPlanAndPreservation(unittest.TestCase):
    def setUp(self):
        self.data = load_authentic_fixture()

    def test_build_plan_preserves_business_records(self):
        plan = cleanup.build_cleanup_plan(self.data, mode="dry-run")
        db_targets = plan["db_targets"]
        preservation = plan["preservation_plan"]

        # 8 documents targeted
        self.assertEqual(len(db_targets["documents"]), 8)
        # 4 submissions targeted
        self.assertEqual(len(db_targets["submissions"]), 4)

        # Confirm cancellation records are preserved, NOT in deletion targets
        for rec_id in cleanup.PRESERVED_BUSINESS_RECORDS:
            self.assertNotIn(rec_id, db_targets["documents"])
            self.assertNotIn(rec_id, db_targets["submissions"])
            self.assertIn(rec_id, preservation["preserved_business_records"])

        # Confirm seeded partners are preserved
        for seed in cleanup.PRESERVED_SEEDED_PARTNERS:
            self.assertIn(seed, preservation["preserved_seeded_partners"])

        # Confirm historical failed runs are marked for preservation
        self.assertIn("8d", preservation["preserve_failed_historical_fixtures"])
        self.assertIn("03a", preservation["preserve_failed_historical_fixtures"])

    def test_guarded_statements_are_parameterized(self):
        plan = cleanup.build_cleanup_plan(self.data, mode="dry-run")
        stmts = plan["db_targets"]["guarded_statements"]

        for s in stmts:
            sql = s["sql"]
            self.assertTrue(sql.startswith("DELETE FROM fleet."))
            self.assertNotIn("DROP", sql.upper())
            self.assertNotIn("TRUNCATE", sql.upper())
            self.assertNotIn("DELETE FROM fleet.supply_submissions;", sql)
            # Must contain WHERE clause and parameterized placeholders
            self.assertIn("WHERE", sql)
            self.assertIn("$1", sql)
            self.assertTrue(len(s["params"]) >= 1)

    def test_invalid_mode_rejected(self):
        with self.assertRaises(ValueError):
            cleanup.build_cleanup_plan(self.data, mode="invalid_mode")


class TestGCSCleanupExecution(unittest.TestCase):
    def setUp(self):
        self.data = load_authentic_fixture()
        self.plan = cleanup.build_cleanup_plan(self.data, mode="dry-run")
        self.calls = []

    def mock_gcs_runner_success(self, action: str, bucket: str, key: str, generation=None):
        self.calls.append({"action": action, "bucket": bucket, "key": key, "generation": generation})
        if action == "describe":
            # If not yet deleted in test
            if not getattr(self, "deleted_keys", None):
                self.deleted_keys = set()
            if key in self.deleted_keys:
                return {"status": "not_found", "returncode": 1}
            return {
                "status": "ok",
                "metadata": {
                    "generation": "1728464598123456",
                    "metageneration": "1",
                    "size": cleanup.EXPECTED_FILE_SIZE,
                    "contentType": cleanup.EXPECTED_MIME,
                },
            }
        elif action == "delete":
            if not getattr(self, "deleted_keys", None):
                self.deleted_keys = set()
            self.deleted_keys.add(key)
            return {"status": "ok", "deleted": True}
        return {"status": "error"}

    def test_dry_run_does_not_mutate(self):
        res = cleanup.execute_gcs_cleanup(self.plan, gcs_runner=self.mock_gcs_runner_success)
        self.assertEqual(res["status"], "success")
        self.assertEqual(res["mode"], "dry-run")
        self.assertEqual(len(res["receipts"]), 8)

        # Confirms delete was NEVER called
        delete_calls = [c for c in self.calls if c["action"] == "delete"]
        self.assertEqual(len(delete_calls), 0)
        for r in res["receipts"]:
            self.assertEqual(r["status"], "planned")

    def test_apply_mode_executes_generation_matched_deletes(self):
        apply_plan = copy.deepcopy(self.plan)
        apply_plan["mode"] = "apply"

        res = cleanup.execute_gcs_cleanup(apply_plan, gcs_runner=self.mock_gcs_runner_success)
        self.assertEqual(res["status"], "success")
        self.assertEqual(res["mode"], "apply")
        self.assertEqual(len(res["receipts"]), 8)

        # 8 describe before, 8 delete, 8 describe after
        describe_calls = [c for c in self.calls if c["action"] == "describe"]
        delete_calls = [c for c in self.calls if c["action"] == "delete"]
        self.assertEqual(len(delete_calls), 8)
        self.assertEqual(len(describe_calls), 16)

        for d in delete_calls:
            self.assertEqual(d["generation"], "1728464598123456")

        for r in res["receipts"]:
            self.assertEqual(r["status"], "deleted")
            self.assertTrue(r["verified_absent"])

    def test_replaced_generation_fails_closed(self):
        apply_plan = copy.deepcopy(self.plan)
        apply_plan["mode"] = "apply"

        def runner_gen_mismatch(action: str, bucket: str, key: str, generation=None):
            if action == "describe":
                return {
                    "status": "ok",
                    "metadata": {"generation": "111", "size": cleanup.EXPECTED_FILE_SIZE},
                }
            if action == "delete":
                # Simulated GCS precondition failed (412)
                return {"status": "error", "returncode": 1}
            return {"status": "error"}

        with self.assertRaises(ValueError) as ctx:
            cleanup.execute_gcs_cleanup(apply_plan, gcs_runner=runner_gen_mismatch)
        self.assertIn("GCS deletion failed", str(ctx.exception))

    def test_post_delete_still_present_fails_closed(self):
        apply_plan = copy.deepcopy(self.plan)
        apply_plan["mode"] = "apply"

        def runner_not_absent(action: str, bucket: str, key: str, generation=None):
            if action == "describe":
                # Always present!
                return {
                    "status": "ok",
                    "metadata": {"generation": "111", "size": cleanup.EXPECTED_FILE_SIZE},
                }
            if action == "delete":
                return {"status": "ok"}
            return {"status": "error"}

        with self.assertRaises(ValueError) as ctx:
            cleanup.execute_gcs_cleanup(apply_plan, gcs_runner=runner_not_absent)
        self.assertIn("still present after deletion", str(ctx.exception))

    def test_live_size_mismatch_fails_closed(self):
        apply_plan = copy.deepcopy(self.plan)
        apply_plan["mode"] = "apply"

        def runner_bad_size(action: str, bucket: str, key: str, generation=None):
            if action == "describe":
                return {
                    "status": "ok",
                    "metadata": {"generation": "111", "size": 9999},
                }
            return {"status": "ok"}

        with self.assertRaises(ValueError) as ctx:
            cleanup.execute_gcs_cleanup(apply_plan, gcs_runner=runner_bad_size)
        self.assertIn("Object size mismatch", str(ctx.exception))

    def test_missing_generation_fails_closed(self):
        apply_plan = copy.deepcopy(self.plan)
        apply_plan["mode"] = "apply"

        def runner_missing_gen(action: str, bucket: str, key: str, generation=None):
            if action == "describe":
                return {
                    "status": "ok",
                    "metadata": {"size": cleanup.EXPECTED_FILE_SIZE},
                }
            return {"status": "ok"}

        with self.assertRaises(ValueError) as ctx:
            cleanup.execute_gcs_cleanup(apply_plan, gcs_runner=runner_missing_gen)
        self.assertIn("Missing object generation", str(ctx.exception))

    def test_already_absent_object_handled(self):
        apply_plan = copy.deepcopy(self.plan)
        apply_plan["mode"] = "apply"

        def runner_absent(action: str, bucket: str, key: str, generation=None):
            return {"status": "not_found", "returncode": 1}

        res = cleanup.execute_gcs_cleanup(apply_plan, gcs_runner=runner_absent)
        self.assertEqual(res["status"], "success")
        for r in res["receipts"]:
            self.assertEqual(r["status"], "already_absent")
            self.assertTrue(r["verified_absent"])

    def test_partial_failure_halts_immediately(self):
        apply_plan = copy.deepcopy(self.plan)
        apply_plan["mode"] = "apply"
        call_count = {"count": 0}

        deleted_set = set()

        def runner_fail_third(action: str, bucket: str, key: str, generation=None):
            if action == "describe":
                if key in deleted_set:
                    return {"status": "not_found", "returncode": 1}
                return {
                    "status": "ok",
                    "metadata": {"generation": "123", "size": cleanup.EXPECTED_FILE_SIZE},
                }
            if action == "delete":
                call_count["count"] += 1
                if call_count["count"] == 3:
                    return {"status": "error", "returncode": 1}
                deleted_set.add(key)
                return {"status": "ok"}
            return {"status": "error"}

        with self.assertRaises(ValueError) as ctx:
            cleanup.execute_gcs_cleanup(apply_plan, gcs_runner=runner_fail_third)
        self.assertIn("GCS deletion failed", str(ctx.exception))
        self.assertEqual(call_count["count"], 3)


class TestDBCleanupExecution(unittest.TestCase):
    def setUp(self):
        self.data = load_authentic_fixture()
        self.plan = cleanup.build_cleanup_plan(self.data, mode="dry-run")

    def test_default_hosted_lane_reports_concrete_blocker(self):
        # When no runner is passed (the current hosted lane with WIF deployer SA),
        # it must report the concrete blocker without throwing unhandled exceptions.
        res = cleanup.execute_db_cleanup(self.plan, db_runner=None)
        self.assertEqual(res["status"], "blocked")
        self.assertIn("Current authorized hosted workflow lane", res["concrete_blocker"])
        self.assertTrue(res["plan_prepared"])
        self.assertEqual(len(res["receipts"]), 0)

    def test_authorized_db_runner_executes_guarded_statements(self):
        db_calls = []

        def mock_db_runner(sql: str, params: list):
            db_calls.append({"sql": sql, "params": params})
            rows = 8 if "supply_documents" in sql else 4
            return {"status": "ok", "rows_affected": rows}

        res = cleanup.execute_db_cleanup(self.plan, db_runner=mock_db_runner)
        self.assertEqual(res["status"], "applied")
        self.assertIsNone(res["concrete_blocker"])
        self.assertEqual(len(res["receipts"]), 5)
        self.assertEqual(len(db_calls), 5)

        # Check statement order
        self.assertEqual(res["receipts"][0]["table"], "fleet.supply_documents")
        self.assertEqual(res["receipts"][0]["rows_affected"], 8)
        self.assertEqual(res["receipts"][4]["table"], "fleet.supply_submissions")
        self.assertEqual(res["receipts"][4]["rows_affected"], 4)

    def test_db_runner_error_fails_closed(self):
        def mock_failing_runner(sql: str, params: list):
            return {"status": "error", "error": "deadlock"}

        with self.assertRaises(ValueError) as ctx:
            cleanup.execute_db_cleanup(self.plan, db_runner=mock_failing_runner)
        self.assertIn("DB execution error", str(ctx.exception))


class TestPipelineAndCLI(unittest.TestCase):
    def setUp(self):
        self.data = load_authentic_fixture()

    def test_pipeline_dry_run_end_to_end(self):
        def mock_gcs(action: str, bucket: str, key: str, generation=None):
            return {
                "status": "ok",
                "metadata": {
                    "generation": "1728464598123456",
                    "size": cleanup.EXPECTED_FILE_SIZE,
                },
            }

        res = cleanup.run_cleanup_pipeline(
            self.data, mode="dry-run", gcs_runner=mock_gcs, db_runner=None
        )
        self.assertEqual(res["mode"], "dry-run")
        self.assertEqual(res["source_sha"], cleanup.EXPECTED_SOURCE_SHA)
        self.assertEqual(res["gcs_cleanup"]["status"], "success")
        self.assertEqual(res["db_cleanup"]["status"], "blocked")
        self.assertTrue(res["preservation"]["preserve_audit_logs"])

    def test_cli_missing_inventory(self):
        code = cleanup.main(["--inventory", "/nonexistent/path/inv.json"])
        self.assertEqual(code, 1)

    def test_cli_dry_run_success(self):
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False) as f:
            json.dump(self.data, f)
            temp_path = f.name

        try:
            with patch.object(cleanup, "default_gcs_runner") as mock_runner:
                mock_runner.return_value = {
                    "status": "ok",
                    "metadata": {
                        "generation": "123456",
                        "size": cleanup.EXPECTED_FILE_SIZE,
                    },
                }
                code = cleanup.main(["--inventory", temp_path, "--mode", "dry-run"])
                self.assertEqual(code, 0)
        finally:
            os.remove(temp_path)

    def test_cli_offline_dry_run(self):
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False) as f:
            json.dump(self.data, f)
            temp_path = f.name

        try:
            code = cleanup.main(["--inventory", temp_path, "--mode", "dry-run", "--offline"])
            self.assertEqual(code, 0)
        finally:
            os.remove(temp_path)

    def test_cli_offline_apply_rejected(self):
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False) as f:
            json.dump(self.data, f)
            temp_path = f.name

        try:
            code = cleanup.main(["--inventory", temp_path, "--mode", "apply", "--offline"])
            self.assertEqual(code, 2)
        finally:
            os.remove(temp_path)


if __name__ == "__main__":
    unittest.main()
