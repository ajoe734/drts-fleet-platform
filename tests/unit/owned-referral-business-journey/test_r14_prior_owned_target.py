"""Socket-free unit tests for R14 official prior-owned-target discovery and workflow wiring."""
from __future__ import annotations

import contextlib
import copy
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import tempfile
import unittest
from unittest.mock import patch
import warnings
import zipfile

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "tests/e2e/owned-referral-business-journey/r14-prior-owned-target.py"
WORKFLOW = ROOT / ".github/workflows/ci-integ.yml"

spec = importlib.util.spec_from_file_location("r14_prior_owned_target", SOURCE)
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)

DEFINITION_SHA = "a" * 40
RUNTIME_SHA = "b" * 40
STAGE_A_RUN_ID = 45000000101
CURRENT_RUN_ID = 45000000202
ARTIFACT_ID = 14000000101
APPROVED_DATE = "2026-11-22"
EVALUATED_DATE = "2026-11-23"
FUTURE_DATE = "2027-11-23"
NONCE = "owned-referral-45000000101-11111111-2222-3333-4444-555555555555"
DRIVER_ID = "drv_11111111-2222-3333-4444-555555555555"
VEHICLE_ID = "veh_66666666-7777-8888-9999-000000000000"
PLATE_NO = "SIM-1234ABCD"
DRIVER_SUB_ID = "11111111-2222-4333-8444-555555555501"
VEHICLE_SUB_ID = "11111111-2222-4333-8444-555555555502"
CONTRACT_ID = "contract_11111111-2222-4333-8444-555555555503"
POLICY_ID = "policy_11111111-2222-4333-8444-555555555504"


def sha256_hex(data: bytes | str) -> str:
    raw = data.encode("utf-8") if isinstance(data, str) else data
    return hashlib.sha256(raw).hexdigest()


def build_stage_a_projection() -> dict:
    docs = []
    all_types = [
        ("professional_driver_license", DRIVER_SUB_ID),
        ("taxi_driver_registration", DRIVER_SUB_ID),
        ("vehicle_registration", VEHICLE_SUB_ID),
        ("fleet_participation_contract", VEHICLE_SUB_ID),
        ("insurance_policy", VEHICLE_SUB_ID),
    ]
    for idx, (doc_type, sub_id) in enumerate(all_types, start=1):
        digest = sha256_hex(f"synthetic-demo-doc-{idx}-{doc_type}")
        docs.append(
            {
                "documentId": f"doc_0000000{idx}_{doc_type}",
                "submissionId": sub_id,
                "documentType": doc_type,
                "effectiveFrom": "2026-11-21",
                "effectiveUntil": APPROVED_DATE,
                "sha256": digest,
                "readbackSha256": digest,
                "scanState": "clean",
                "bytes": 248,
                "reviewStatus": "approved",
            }
        )
    return {
        "schema": reader.STAGE_A_SCHEMA,
        "stage": "stageA",
        "repository": reader.REPOSITORY,
        "definitionSha": DEFINITION_SHA,
        "runtimeSha": RUNTIME_SHA,
        "entrySlug": reader.ENTRY_SLUG,
        "subject": reader.SUBJECT,
        "fleetPartnerId": reader.FLEET_PARTNER_ID,
        "tenantId": reader.TENANT_ID,
        "nonce": NONCE,
        "approvedUtcDate": APPROVED_DATE,
        "driverId": DRIVER_ID,
        "vehicleId": VEHICLE_ID,
        "plateNo": PLATE_NO,
        "driverSubmissionId": DRIVER_SUB_ID,
        "vehicleSubmissionId": VEHICLE_SUB_ID,
        "canonicalContractId": CONTRACT_ID,
        "canonicalPolicyId": POLICY_ID,
        "contractEndAt": f"{APPROVED_DATE}T23:59:59.000Z",
        "policyEndAt": f"{APPROVED_DATE}T23:59:59.000Z",
        "professionalDriverLicenseExpiry": APPROVED_DATE,
        "taxiDriverRegistrationExpiry": APPROVED_DATE,
        "exclusivityEffectiveEnd": f"{FUTURE_DATE}T23:59:59.000Z",
        "documents": docs,
        "approvals": {
            "driver": {
                "submissionId": DRIVER_SUB_ID,
                "status": "approved",
                "submittedBy": "key_fleet_submitter_001",
                "reviewedBy": "usr_platform_admin_001",
                "approvedAt": f"{APPROVED_DATE}T10:15:00.000Z",
                "revisionNo": 4,
            },
            "vehicle": {
                "submissionId": VEHICLE_SUB_ID,
                "status": "approved",
                "submittedBy": "key_fleet_submitter_001",
                "reviewedBy": "usr_platform_admin_001",
                "approvedAt": f"{APPROVED_DATE}T10:16:00.000Z",
                "revisionNo": 5,
                "sourceContractSubmissionId": VEHICLE_SUB_ID,
                "sourcePolicySubmissionId": VEHICLE_SUB_ID,
            },
        },
        "cleanup": {
            "driverWorkStateOffline": True,
            "driverBindingRevoked": True,
            "fleetSessionCleaned": True,
            "mainOrderCompleted": True,
            "secondSupplyProvisioned": True,
            "cleanupErrors": [],
        },
    }


def build_candidate_bundle(
    *,
    mutate_stage_a=None,
    mutate_evidence=None,
    mutate_journal=None,
    mutate_metadata=None,
    mutate_run=None,
    extra_members: list[tuple[str, bytes]] | None = None,
    symlink_member: str | None = None,
    drop_members: set[str] | None = None,
    run_id: int = STAGE_A_RUN_ID,
    artifact_id: int = ARTIFACT_ID,
) -> tuple[dict, dict, bytes]:
    stage_a = build_stage_a_projection()
    if mutate_stage_a:
        mutate_stage_a(stage_a)

    command_body = json.dumps(
        {
            "entrySlug": reader.ENTRY_SLUG,
            "quoteId": "quote_001",
            "partnerUserRef": reader.SUBJECT,
            "idempotencyKey": f"{NONCE}-booking",
        },
        separators=(",", ":"),
    )
    body_sha = sha256_hex(command_body)
    booking_journal = {
        "version": 1,
        "state": "acknowledged",
        "definitionSha": DEFINITION_SHA,
        "runtimeSha": RUNTIME_SHA,
        "nonce": NONCE,
        "entrySlug": reader.ENTRY_SLUG,
        "partnerUserRef": reader.SUBJECT,
        "quoteId": "quote_001",
        "body": command_body,
        "bodySha256": body_sha,
        "idempotencyKey": f"{NONCE}-booking",
        "orderId": "order_main_001",
        "syntheticData": True,
        "recovery": "Possible own write.",
    }
    if mutate_journal:
        mutate_journal(booking_journal)

    evidence = {
        "definitionSha": DEFINITION_SHA,
        "runtimeSha": RUNTIME_SHA,
        "nonce": NONCE,
        "entrySlug": reader.ENTRY_SLUG,
        "subject": reader.SUBJECT,
        "mode": "full-journey",
        "completed": True,
        "mainOrderCompleted": True,
        "cleanupErrors": [],
        "bookingWrite": {
            "state": "acknowledged",
            "bodySha256": body_sha,
            "journal": "booking-write-journal.json",
            "recovery": "Possible own write.",
        },
        "browserRatingWrite": {
            "state": "acknowledged",
            "orderId": "order_main_001",
            "bodySha256": sha256_hex("rating"),
        },
        "r14StageA": stage_a,
        "events": [
            {
                "stage": "own-supply-exclusivity-approved",
                "driverId": DRIVER_ID,
                "vehicleId": VEHICLE_ID,
                "result": "retained",
            },
            {
                "stage": "owned-public-Demo-order-created",
                "orderId": "order_main_001",
                "driverId": DRIVER_ID,
                "vehicleId": VEHICLE_ID,
            },
        ],
        "finalization": {
            "reason": "completed",
            "wholeRunPassed": True,
        },
    }
    if mutate_evidence:
        mutate_evidence(evidence)

    runtime_doc = {
        "phase": "before",
        "expectedRuntimeSha": RUNTIME_SHA,
        "allMatch": True,
    }
    members = [
        ("runtime-before.json", json.dumps(runtime_doc).encode("utf-8")),
        (
            "runtime-after.json",
            json.dumps({**runtime_doc, "phase": "after"}).encode("utf-8"),
        ),
        ("journey-evidence.json", json.dumps(evidence).encode("utf-8")),
        ("booking-write-journal.json", json.dumps(booking_journal).encode("utf-8")),
    ]
    if extra_members:
        members.extend(extra_members)

    raw = io.BytesIO()
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", UserWarning)
        with zipfile.ZipFile(raw, "w", zipfile.ZIP_DEFLATED) as zipped:
            for name, content in members:
                if drop_members and name in drop_members:
                    continue
                zipped.writestr(name, content)
            if symlink_member:
                info = zipfile.ZipInfo(symlink_member)
                info.external_attr = (stat.S_IFLNK | 0o777) << 16
                zipped.writestr(info, b"target")

    archive = raw.getvalue()
    metadata = {
        "id": artifact_id,
        "name": f"owned-referral-business-{RUNTIME_SHA}-{run_id}",
        "expired": False,
        "size_in_bytes": len(archive),
        "digest": f"sha256:{sha256_hex(archive)}",
        "workflow_run": {
            "id": run_id,
            "head_sha": DEFINITION_SHA,
            "head_branch": "dev",
        },
    }
    if mutate_metadata:
        mutate_metadata(metadata)

    run_detail = {
        "id": run_id,
        "head_sha": DEFINITION_SHA,
        "event": "workflow_dispatch",
        "status": "completed",
        "conclusion": "success",
        "path": ".github/workflows/ci-integ.yml@refs/heads/dev",
        "repository": {"full_name": reader.REPOSITORY},
    }
    if mutate_run:
        mutate_run(run_detail)

    return metadata, run_detail, archive


class R14PriorOwnedTargetDiscoveryTests(unittest.TestCase):
    def test_zero_candidate_decides_stage_a(self):
        manifest = reader.discover_prior_owned_target(
            expected_definition_sha=DEFINITION_SHA,
            expected_runtime_sha=RUNTIME_SHA,
            current_run_id=CURRENT_RUN_ID,
            current_utc_date=EVALUATED_DATE,
            fetch_json=lambda _path: {"artifacts": []},
            fetch_bytes=lambda _path, _limit: b"",
        )
        self.assertEqual(manifest["schema"], reader.MANIFEST_SCHEMA)
        self.assertEqual(manifest["decision"], "stageA")
        self.assertEqual(manifest["candidateCount"], 0)
        self.assertIsNone(manifest["target"])

    def test_one_uniquely_valid_candidate_decides_stage_b(self):
        metadata, run_detail, archive = build_candidate_bundle()
        json_map = {
            f"repos/{reader.REPOSITORY}/actions/artifacts?per_page={reader.PER_PAGE}&page=1": {
                "artifacts": [metadata]
            },
            f"repos/{reader.REPOSITORY}/actions/artifacts/{ARTIFACT_ID}": metadata,
            f"repos/{reader.REPOSITORY}/actions/runs/{STAGE_A_RUN_ID}": run_detail,
        }
        bytes_map = {
            f"repos/{reader.REPOSITORY}/actions/artifacts/{ARTIFACT_ID}/zip": archive,
        }
        manifest = reader.discover_prior_owned_target(
            expected_definition_sha=DEFINITION_SHA,
            expected_runtime_sha=RUNTIME_SHA,
            current_run_id=CURRENT_RUN_ID,
            current_utc_date=EVALUATED_DATE,
            fetch_json=lambda path: json_map[path],
            fetch_bytes=lambda path, _limit: bytes_map[path],
        )
        self.assertEqual(manifest["decision"], "stageB")
        self.assertEqual(manifest["candidateCount"], 1)
        self.assertEqual(manifest["officialArtifact"]["runId"], STAGE_A_RUN_ID)
        self.assertEqual(manifest["officialArtifact"]["artifactId"], ARTIFACT_ID)
        self.assertEqual(manifest["officialArtifact"]["archiveSha256"], sha256_hex(archive))
        self.assertEqual(manifest["target"]["driverId"], DRIVER_ID)
        self.assertEqual(manifest["target"]["vehicleId"], VEHICLE_ID)
        self.assertEqual(manifest["target"]["plateNo"], PLATE_NO)
        self.assertEqual(len(manifest["target"]["documents"]), 5)

    def test_duplicate_valid_lineage_rejected(self):
        meta1, run1, arch1 = build_candidate_bundle(run_id=45000000101, artifact_id=14000000101)
        meta2, run2, arch2 = build_candidate_bundle(run_id=45000000102, artifact_id=14000000102)
        json_map = {
            f"repos/{reader.REPOSITORY}/actions/artifacts?per_page={reader.PER_PAGE}&page=1": {
                "artifacts": [meta1, meta2]
            },
            f"repos/{reader.REPOSITORY}/actions/artifacts/14000000101": meta1,
            f"repos/{reader.REPOSITORY}/actions/runs/45000000101": run1,
            f"repos/{reader.REPOSITORY}/actions/artifacts/14000000102": meta2,
            f"repos/{reader.REPOSITORY}/actions/runs/45000000102": run2,
        }
        bytes_map = {
            f"repos/{reader.REPOSITORY}/actions/artifacts/14000000101/zip": arch1,
            f"repos/{reader.REPOSITORY}/actions/artifacts/14000000102/zip": arch2,
        }
        with self.assertRaisesRegex(
            reader.R14TargetError, "r14-duplicate-stage-a-target-lineage"
        ):
            reader.discover_prior_owned_target(
                expected_definition_sha=DEFINITION_SHA,
                expected_runtime_sha=RUNTIME_SHA,
                current_run_id=CURRENT_RUN_ID,
                current_utc_date=EVALUATED_DATE,
                fetch_json=lambda path: json_map[path],
                fetch_bytes=lambda path, _limit: bytes_map[path],
            )

    def test_mismatched_repo_run_head_runtime_and_expired_or_wrong_name_rejected(self):
        cases = [
            (
                "expired artifact",
                {"mutate_metadata": lambda m: m.update(expired=True)},
                "r14-artifact-expired",
            ),
            (
                "wrong artifact name",
                {"mutate_metadata": lambda m: m.update(name="other-artifact-123")},
                "r14-artifact-name-mismatch",
            ),
            (
                "mismatched runtime in artifact name",
                {
                    "mutate_metadata": lambda m: m.update(
                        name=f"owned-referral-business-{'c' * 40}-{STAGE_A_RUN_ID}"
                    )
                },
                "r14-artifact-run-or-sha-mismatch",
            ),
            (
                "mismatched head sha in metadata",
                {
                    "mutate_metadata": lambda m: m["workflow_run"].update(
                        head_sha="d" * 40
                    )
                },
                "r14-artifact-run-or-sha-mismatch",
            ),
            (
                "mismatched run id in run_detail",
                {"mutate_run": lambda r: r.update(id=999999)},
                "r14-run-identity-or-state-mismatch",
            ),
            (
                "mismatched repo in run_detail",
                {
                    "mutate_run": lambda r: r.update(
                        repository={"full_name": "foreign/repo"}
                    )
                },
                "r14-run-identity-or-state-mismatch",
            ),
            (
                "failed run conclusion",
                {"mutate_run": lambda r: r.update(conclusion="failure")},
                "r14-run-identity-or-state-mismatch",
            ),
        ]
        for label, kwargs, expected_code in cases:
            metadata, run_detail, archive = build_candidate_bundle(**kwargs)
            with self.subTest(label=label), self.assertRaisesRegex(
                reader.R14TargetError, expected_code
            ):
                reader.validate_candidate_artifact(
                    metadata,
                    run_detail,
                    archive,
                    expected_definition_sha=DEFINITION_SHA,
                    expected_runtime_sha=RUNTIME_SHA,
                    current_utc_date=EVALUATED_DATE,
                )

    def test_archive_zip_slip_symlink_bomb_oversize_duplicate_and_digest_rejected(self):
        for label, extra, symlink, drop, expected in [
            (
                "zip slip traversal",
                [("../evil.json", b"{}")],
                None,
                None,
                "r14-archive-unsafe-member-path",
            ),
            (
                "unallowlisted member",
                [("secret.json", b"{}")],
                None,
                None,
                "r14-archive-member-not-allowlisted",
            ),
            (
                "duplicate member",
                [("runtime-before.json", b"{}")],
                None,
                None,
                "r14-archive-duplicate-member",
            ),
            (
                "symlink member",
                None,
                "own-receipt.txt",
                None,
                "r14-archive-symlink-or-nonregular-member",
            ),
            (
                "missing required member",
                None,
                None,
                {"journey-evidence.json"},
                "r14-archive-required-members-missing",
            ),
            (
                "zip bomb ratio",
                [("own-receipt.txt", b"0" * 200_000)],
                None,
                None,
                "r14-archive-compression-ratio-exceeded",
            ),
        ]:
            metadata, run_detail, archive = build_candidate_bundle(
                extra_members=extra,
                symlink_member=symlink,
                drop_members=drop,
            )
            with self.subTest(label=label), self.assertRaisesRegex(
                reader.R14TargetError, expected
            ):
                reader.validate_candidate_artifact(
                    metadata,
                    run_detail,
                    archive,
                    expected_definition_sha=DEFINITION_SHA,
                    expected_runtime_sha=RUNTIME_SHA,
                    current_utc_date=EVALUATED_DATE,
                )

        metadata, run_detail, archive = build_candidate_bundle()
        with patch.object(reader, "MAX_MEMBER_BYTES", 64), self.assertRaisesRegex(
            reader.R14TargetError, "r14-archive-member-size-bounds"
        ):
            reader.validate_candidate_artifact(
                metadata,
                run_detail,
                archive,
                expected_definition_sha=DEFINITION_SHA,
                expected_runtime_sha=RUNTIME_SHA,
                current_utc_date=EVALUATED_DATE,
            )

        tampered = archive[:-1] + bytes([archive[-1] ^ 1])
        with self.assertRaisesRegex(reader.R14TargetError, "r14-archive-digest-mismatch"):
            reader.validate_candidate_artifact(
                metadata,
                run_detail,
                tampered,
                expected_definition_sha=DEFINITION_SHA,
                expected_runtime_sha=RUNTIME_SHA,
                current_utc_date=EVALUATED_DATE,
            )

    def test_stage_a_schema_member_sha_foreign_ids_dates_docs_approval_and_unknown_custody_rejected(
        self,
    ):
        cases = [
            (
                "wrong booking journal member sha",
                {"mutate_journal": lambda j: j.update(bodySha256="0" * 64)},
                "r14-booking-journal-member-sha-mismatch",
            ),
            (
                "unknown booking ACK custody",
                {
                    "mutate_evidence": lambda e: e["bookingWrite"].update(
                        state="ack_unknown"
                    )
                },
                "r14-evidence-unknown-booking-ack",
            ),
            (
                "foreign driver ID not matching journey events",
                {"mutate_stage_a": lambda s: s.update(driverId="drv_foreign_999")},
                "r14-stage-a-own-pair-events-unverified",
            ),
            (
                "missing own ID",
                {"mutate_stage_a": lambda s: s.update(vehicleId="")},
                "r14-stage-a-vehicleId-invalid",
            ),
            (
                "invalid schema version",
                {"mutate_stage_a": lambda s: s.update(schema="wrong-schema")},
                "r14-stage-a-identity-binding-mismatch",
            ),
            (
                "same UTC day not yet rolled over",
                {
                    "mutate_stage_a": lambda s: (
                        s.update(
                            approvedUtcDate=EVALUATED_DATE,
                            professionalDriverLicenseExpiry=EVALUATED_DATE,
                            taxiDriverRegistrationExpiry=EVALUATED_DATE,
                            contractEndAt=f"{EVALUATED_DATE}T23:59:59.000Z",
                            policyEndAt=f"{EVALUATED_DATE}T23:59:59.000Z",
                        ),
                        [d.update(effectiveUntil=EVALUATED_DATE) for d in s["documents"]],
                        s["approvals"]["driver"].update(
                            approvedAt=f"{EVALUATED_DATE}T01:00:00.000Z"
                        ),
                        s["approvals"]["vehicle"].update(
                            approvedAt=f"{EVALUATED_DATE}T01:01:00.000Z"
                        ),
                    )
                },
                "r14-stage-a-not-yet-expired-utc-rollover-required",
            ),
            (
                "wrong document count (4 instead of 5)",
                {"mutate_stage_a": lambda s: s.update(documents=s["documents"][:4])},
                "r14-stage-a-five-documents-required",
            ),
            (
                "duplicate document type",
                {
                    "mutate_stage_a": lambda s: s["documents"][-1].update(
                        documentType="vehicle_registration"
                    )
                },
                "r14-stage-a-document-type-invalid",
            ),
            (
                "wrong document effectiveUntil date",
                {
                    "mutate_stage_a": lambda s: s["documents"][0].update(
                        effectiveUntil=FUTURE_DATE
                    )
                },
                "r14-stage-a-document-effective-dates-invalid",
            ),
            (
                "document readback sha mismatch",
                {
                    "mutate_stage_a": lambda s: s["documents"][0].update(
                        readbackSha256="f" * 64
                    )
                },
                "r14-stage-a-document-sha-invalid",
            ),
            (
                "self-approved submission (submittedBy == reviewedBy)",
                {
                    "mutate_stage_a": lambda s: s["approvals"]["vehicle"].update(
                        reviewedBy=s["approvals"]["vehicle"]["submittedBy"]
                    )
                },
                "r14-stage-a-vehicle-approval-fields-invalid",
            ),
            (
                "missing stage A projection on full-journey artifact",
                {"mutate_evidence": lambda e: e.update(r14StageA=None)},
                "r14-stage-a-projection-missing",
            ),
            (
                "unclean Stage A finalization",
                {"mutate_stage_a": lambda s: s["cleanup"].update(driverWorkStateOffline=False)},
                "r14-stage-a-cleanup-state-invalid",
            ),
        ]
        for label, kwargs, expected_code in cases:
            metadata, run_detail, archive = build_candidate_bundle(**kwargs)
            with self.subTest(label=label), self.assertRaisesRegex(
                reader.R14TargetError, expected_code
            ):
                reader.validate_candidate_artifact(
                    metadata,
                    run_detail,
                    archive,
                    expected_definition_sha=DEFINITION_SHA,
                    expected_runtime_sha=RUNTIME_SHA,
                    current_utc_date=EVALUATED_DATE,
                )

    def test_main_writes_manifest_only_on_valid_input_and_fails_closed_before_caller(
        self,
    ):
        metadata, run_detail, archive = build_candidate_bundle()
        json_map = {
            f"repos/{reader.REPOSITORY}/actions/artifacts?per_page={reader.PER_PAGE}&page=1": {
                "artifacts": [metadata]
            },
            f"repos/{reader.REPOSITORY}/actions/artifacts/{ARTIFACT_ID}": metadata,
            f"repos/{reader.REPOSITORY}/actions/runs/{STAGE_A_RUN_ID}": run_detail,
        }
        bytes_map = {
            f"repos/{reader.REPOSITORY}/actions/artifacts/{ARTIFACT_ID}/zip": archive,
        }
        with tempfile.TemporaryDirectory() as tmpdir:
            manifest_path = Path(tmpdir) / "r14-prior-owned-target.json"
            env = {
                "GITHUB_ACTIONS": "true",
                "OWNED_REFERRAL_HOSTED_OPT_IN": "true",
                "OWNED_REFERRAL_RECOVERY_ONLY": "false",
                "GITHUB_REPOSITORY": reader.REPOSITORY,
                "GH_TOKEN": "ghs_test_token_confined",
                "EXPECTED_DEFINITION_SHA": DEFINITION_SHA,
                "EXPECTED_RUNTIME_SHA": RUNTIME_SHA,
                "GITHUB_RUN_ID": str(CURRENT_RUN_ID),
                "R14_EVALUATED_UTC_DATE": EVALUATED_DATE,
                "OWNED_R14_PRIOR_TARGET_MANIFEST": str(manifest_path),
            }
            with patch.dict(os.environ, env, clear=True), patch.object(
                reader, "gh_read_json", lambda path: json_map[path]
            ), patch.object(
                reader, "gh_read_bytes", lambda path, _limit=0: bytes_map[path]
            ), contextlib.redirect_stdout(io.StringIO()):
                reader.main()

            self.assertTrue(manifest_path.exists())
            self.assertEqual(manifest_path.stat().st_mode & 0o777, 0o600)
            written = json.loads(manifest_path.read_text("utf-8"))
            self.assertEqual(written["decision"], "stageB")
            self.assertNotIn("ghs_test_token_confined", manifest_path.read_text("utf-8"))

            bad_path = Path(tmpdir) / "failed-manifest.json"
            bad_meta = copy.deepcopy(metadata)
            bad_meta["expired"] = True
            bad_json_map = {
                f"repos/{reader.REPOSITORY}/actions/artifacts?per_page={reader.PER_PAGE}&page=1": {
                    "artifacts": [bad_meta]
                }
            }
            with patch.dict(
                os.environ,
                {**env, "OWNED_R14_PRIOR_TARGET_MANIFEST": str(bad_path)},
                clear=True,
            ), patch.object(
                reader, "gh_read_json", lambda path: bad_json_map[path]
            ), self.assertRaisesRegex(
                reader.R14TargetError, "r14-artifact-expired"
            ):
                reader.main()
            self.assertFalse(bad_path.exists())

    def test_static_ci_integ_workflow_owned_job_controls(self):
        text = WORKFLOW.read_text("utf-8")
        # Extract workflow_dispatch inputs block and owned-referral-business-journey job block.
        owned_start = text.index("  owned-referral-business-journey:")
        shared_agency_start = text.index("  shared-agency-acceptance:", owned_start)
        owned_block = text[owned_start:shared_agency_start]

        # 1. No new runner or new workflow_dispatch input.
        self.assertIn("runs-on: ubuntu-24.04", owned_block)
        dispatch_start = text.index("  workflow_dispatch:")
        jobs_start = text.index("\njobs:", dispatch_start)
        dispatch_block = text[dispatch_start:jobs_start]
        for forbidden_input in ("r14", "renewal", "prior_target", "stage_a", "stage_b"):
            self.assertNotIn(forbidden_input, dispatch_block.lower())

        # 2. Recovery-only step untouched.
        self.assertIn(
            "- name: Read the exact retained original booking journal\n"
            "        if: inputs.owned_referral_recovery_only == true\n"
            "        env:\n"
            "          GH_TOKEN: ${{ github.token }}\n"
            '          OWNED_REFERRAL_HOSTED_OPT_IN: "true"\n'
            '          OWNED_REFERRAL_RECOVERY_ONLY: "true"\n'
            "        run: python3 tests/e2e/owned-referral-business-journey/retained-journal.py",
            owned_block,
        )

        # 3. Normal-only prior target reader step present with per-step GH_TOKEN.
        self.assertIn(
            "- name: Discover and validate prior official owned R14 supply target\n"
            "        if: inputs.owned_referral_recovery_only != true\n"
            "        env:\n"
            "          GH_TOKEN: ${{ github.token }}\n"
            '          OWNED_REFERRAL_HOSTED_OPT_IN: "true"\n'
            '          OWNED_REFERRAL_RECOVERY_ONLY: "false"\n'
            "          OWNED_R14_PRIOR_TARGET_MANIFEST: .artifacts/owned-referral-business-journey/r14-prior-owned-target.json\n"
            "        run: python3 tests/e2e/owned-referral-business-journey/r14-prior-owned-target.py",
            owned_block,
        )

        # 4. Playwright step receives manifest path and does NOT receive GH_TOKEN.
        pw_start = owned_block.index(
            "- name: Execute one owned synthetic same-order business lifecycle"
        )
        pw_end = owned_block.index(
            "- name: Verify all five runtime revisions stayed unchanged", pw_start
        )
        pw_block = owned_block[pw_start:pw_end]
        self.assertIn(
            "OWNED_R14_PRIOR_TARGET_MANIFEST: .artifacts/owned-referral-business-journey/r14-prior-owned-target.json",
            pw_block,
        )
        self.assertNotIn("GH_TOKEN", pw_block)
        self.assertNotIn("github.token", pw_block)


if __name__ == "__main__":
    unittest.main()
