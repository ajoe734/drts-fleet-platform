"""Bounded official-artifact reader for R14 two-stage genuine-expiry normal FULL handoff.

In normal FULL (`inputs.owned_referral_recovery_only != true`), walks this workflow's
manually dispatched runs within artifact retention, discovers their prior official
`owned-referral-business-<runtime>-<run>` artifacts via the authenticated GitHub Actions
API, validates archive bounds/members/digests and Stage A provenance, and writes a
bounded local manifest under `.artifacts/owned-referral-business-journey/`.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import io
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import zipfile

REPOSITORY = "ajoe734/drts-fleet-platform"
WORKFLOW_FILE = "ci-integ.yml"
WORKFLOW_PATH_SUFFIX = f".github/workflows/{WORKFLOW_FILE}"
ENTRY_SLUG = "yuhe-residence"
SUBJECT = "referral-demo-yuhe-residence"
FLEET_PARTNER_ID = "fleet-demo-001"
TENANT_ID = "10000000-0000-0000-0000-000000000201"
MANIFEST_SCHEMA = "r14-prior-owned-target-manifest-v1"
STAGE_A_SCHEMA = "r14-stage-a-owned-target-v1"
DEFAULT_OUTPUT = Path(".artifacts/owned-referral-business-journey/r14-prior-owned-target.json")

MAX_PAGES = 5
PER_PAGE = 20
# GitHub can re-run a run for 30 days after it was created.
RUN_WINDOW_DAYS = 30
ARTIFACTS_PER_RUN = 100
JOBS_PER_RUN = 100
JOURNEY_JOB = "owned-referral-business-journey"
MAX_CANDIDATE_RUNS = 15
MAX_ARCHIVE_BYTES = 24 * 1024 * 1024
MAX_MEMBER_COUNT = 64
MAX_MEMBER_BYTES = 8 * 1024 * 1024
MAX_TOTAL_UNCOMPRESSED_BYTES = 24 * 1024 * 1024
MAX_JSON_BYTES = 512 * 1024
MAX_COMPRESSION_RATIO = 100

REQUIRED_DRIVER_DOC_TYPES = (
    "professional_driver_license",
    "taxi_driver_registration",
)
REQUIRED_VEHICLE_DOC_TYPES = (
    "vehicle_registration",
    "fleet_participation_contract",
    "insurance_policy",
)
REQUIRED_ALL_DOC_TYPES = frozenset(REQUIRED_DRIVER_DOC_TYPES + REQUIRED_VEHICLE_DOC_TYPES)
REQUIRED_ARCHIVE_MEMBERS = frozenset({
    "runtime-before.json",
    "runtime-after.json",
    "journey-evidence.json",
    "booking-write-journal.json",
})

_REPORT = r"daily-reports/daily-dispatch-[^/]*\.(?:csv|xlsx|pdf)"
ALLOWED_MEMBERS = tuple(re.compile(f"^(?:{pattern})$") for pattern in (
    r"runtime-before\.json",
    r"runtime-after\.json",
    r"journey-evidence\.json",
    r"booking-write-journal\.json",
    r"own-receipt\.txt",
    r"cancellations/[^/]*-facts\.json",
    r"cancellations/[^/]*-booking-write-journal\.json",
    r"cancellations/results\.json",
    r"cancellations/[^/]*\.png",
    _REPORT,
    r"TEN03-06-custody\.json",
    r"TEN03-06/(?:reservation-1|reservation-2|redispatched)/booking-write-journal\.json",
    rf"TEN03-06/(?:C1-cancelled-null|reservation-1|reservation-2|reservation-1-after-both|redispatched)/{_REPORT}",
))

SAFE_MEMBER_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*(?:/[A-Za-z0-9][A-Za-z0-9._-]*)*$")
ARTIFACT_NAME_RE = re.compile(r"^owned-referral-business-([0-9a-f]{40})-([1-9][0-9]*)$")
SHA40_RE = re.compile(r"^[0-9a-f]{40}$")
SHA64_RE = re.compile(r"^[0-9a-f]{64}$")
DATE_ONLY_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
SAFE_ID_RE = re.compile(r"^[A-Za-z0-9_.:-]{3,128}$")
JWT_LIKE_RE = re.compile(r"^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$")
FORBIDDEN_SECRET_KEYS = frozenset({
    "token",
    "accessToken",
    "refreshToken",
    "idToken",
    "secret",
    "apiKey",
    "plaintextKey",
    "invitation",
    "registrationCode",
    "cookie",
    "authorization",
    "x-drts-authorization",
    "x-serverless-authorization",
})
STAGE_A_REQUIRED_KEYS = frozenset({
    "schema",
    "stage",
    "repository",
    "definitionSha",
    "runtimeSha",
    "entrySlug",
    "subject",
    "fleetPartnerId",
    "tenantId",
    "nonce",
    "approvedUtcDate",
    "driverId",
    "vehicleId",
    "plateNo",
    "driverSubmissionId",
    "vehicleSubmissionId",
    "canonicalContractId",
    "canonicalPolicyId",
    "contractEndAt",
    "policyEndAt",
    "professionalDriverLicenseExpiry",
    "taxiDriverRegistrationExpiry",
    "exclusivityEffectiveEnd",
    "documents",
    "approvals",
    "cleanup",
})
DOCUMENT_REQUIRED_KEYS = frozenset({
    "documentId",
    "submissionId",
    "documentType",
    "effectiveFrom",
    "effectiveUntil",
    "sha256",
    "readbackSha256",
    "scanState",
    "bytes",
    "reviewStatus",
})


class R14TargetError(Exception):
    pass


def require(condition: object, code: str) -> None:
    if not condition:
        raise R14TargetError(code)


def _assert_no_secret_material(value: object) -> None:
    if isinstance(value, dict):
        for key, item in value.items():
            require(
                isinstance(key, str) and key not in FORBIDDEN_SECRET_KEYS,
                "r14-stage-a-secret-key-rejected",
            )
            _assert_no_secret_material(item)
    elif isinstance(value, list):
        for item in value:
            _assert_no_secret_material(item)
    elif isinstance(value, str):
        require(
            not JWT_LIKE_RE.match(value.strip())
            and not value.strip().lower().startswith("bearer "),
            "r14-stage-a-secret-value-rejected",
        )


def _read_bounded_json(zipped: zipfile.ZipFile, info: zipfile.ZipInfo, label: str) -> tuple[bytes, str, dict]:
    require(0 < info.file_size <= MAX_JSON_BYTES, f"r14-{label}-json-bounds")
    raw = zipped.read(info)
    require(len(raw) == info.file_size, f"r14-{label}-json-bounds")
    digest = hashlib.sha256(raw).hexdigest()
    try:
        parsed = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        raise R14TargetError(f"r14-{label}-json-invalid") from None
    require(isinstance(parsed, dict), f"r14-{label}-json-object-required")
    return raw, digest, parsed


def validate_archive_and_extract_evidence(
    archive: bytes,
    expected_size: int | None = None,
    expected_digest: str | None = None,
) -> dict:
    require(
        isinstance(archive, (bytes, bytearray))
        and 0 < len(archive) <= MAX_ARCHIVE_BYTES,
        "r14-archive-size-bounds",
    )
    if expected_size is not None:
        require(
            isinstance(expected_size, int) and len(archive) == expected_size,
            "r14-archive-size-mismatch",
        )
    archive_sha256 = hashlib.sha256(archive).hexdigest()
    if expected_digest is not None:
        require(
            expected_digest == f"sha256:{archive_sha256}",
            "r14-archive-digest-mismatch",
        )
    try:
        zipped = zipfile.ZipFile(io.BytesIO(archive))
    except zipfile.BadZipFile:
        raise R14TargetError("r14-archive-bad-zip") from None

    with zipped:
        entries = zipped.infolist()
        require(
            1 <= len(entries) <= MAX_MEMBER_COUNT,
            "r14-archive-member-count-bounds",
        )
        names = [info.filename for info in entries]
        require(len(set(names)) == len(names), "r14-archive-duplicate-member")

        total_uncompressed = 0
        for info in entries:
            name = info.filename
            require(
                bool(SAFE_MEMBER_NAME.match(name))
                and not name.startswith("/")
                and "\\" not in name
                and ".." not in name.split("/")
                and "." not in name.split("/"),
                "r14-archive-unsafe-member-path",
            )
            require(
                any(pattern.match(name) for pattern in ALLOWED_MEMBERS),
                "r14-archive-member-not-allowlisted",
            )
            require(
                not info.is_dir()
                and not (info.flag_bits & 0x1)
                and info.compress_type in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED),
                "r14-archive-member-flags-invalid",
            )
            mode_type = stat.S_IFMT(info.external_attr >> 16)
            require(
                mode_type in (0, stat.S_IFREG),
                "r14-archive-symlink-or-nonregular-member",
            )
            require(
                0 <= info.file_size <= MAX_MEMBER_BYTES,
                "r14-archive-member-size-bounds",
            )
            if info.file_size > 65536:
                require(
                    info.compress_size > 0
                    and info.file_size <= info.compress_size * MAX_COMPRESSION_RATIO,
                    "r14-archive-compression-ratio-exceeded",
                )
            total_uncompressed += info.file_size
            require(
                total_uncompressed <= MAX_TOTAL_UNCOMPRESSED_BYTES,
                "r14-archive-total-size-bounds",
            )

        require(
            REQUIRED_ARCHIVE_MEMBERS <= set(names),
            "r14-archive-required-members-missing",
        )
        try:
            require(zipped.testzip() is None, "r14-archive-crc-mismatch")
        except zipfile.BadZipFile:
            raise R14TargetError("r14-archive-crc-mismatch") from None

        by_name = {info.filename: info for info in entries}
        evidence_raw, evidence_sha256, evidence = _read_bounded_json(
            zipped, by_name["journey-evidence.json"], "journey-evidence"
        )
        _, before_sha256, runtime_before = _read_bounded_json(
            zipped, by_name["runtime-before.json"], "runtime-before"
        )
        _, after_sha256, runtime_after = _read_bounded_json(
            zipped, by_name["runtime-after.json"], "runtime-after"
        )
        _, journal_sha256, booking_journal = _read_bounded_json(
            zipped, by_name["booking-write-journal.json"], "booking-journal"
        )

    return {
        "archiveBytes": len(archive),
        "archiveSha256": archive_sha256,
        "memberCount": len(entries),
        "journeyEvidenceBytes": len(evidence_raw),
        "journeyEvidenceSha256": evidence_sha256,
        "runtimeBeforeSha256": before_sha256,
        "runtimeAfterSha256": after_sha256,
        "bookingJournalSha256": journal_sha256,
        "evidence": evidence,
        "runtimeBefore": runtime_before,
        "runtimeAfter": runtime_after,
        "bookingJournal": booking_journal,
    }


def validate_stage_a_projection(
    stage_a: object,
    evidence: dict,
    booking_journal: dict,
    runtime_before: dict,
    runtime_after: dict,
    *,
    expected_definition_sha: str,
    expected_runtime_sha: str,
    current_utc_date: str,
) -> dict:
    require(bool(SHA40_RE.match(expected_definition_sha)), "r14-expected-definition-sha-invalid")
    require(bool(SHA40_RE.match(expected_runtime_sha)), "r14-expected-runtime-sha-invalid")
    require(bool(DATE_ONLY_RE.match(current_utc_date)), "r14-current-utc-date-invalid")

    for phase_label, runtime_doc in (("before", runtime_before), ("after", runtime_after)):
        if "expectedRuntimeSha" in runtime_doc:
            require(
                runtime_doc.get("expectedRuntimeSha") == expected_runtime_sha,
                f"r14-runtime-{phase_label}-sha-mismatch",
            )
        if "allMatch" in runtime_doc:
            require(
                runtime_doc.get("allMatch") is True,
                f"r14-runtime-{phase_label}-fence-failed",
            )

    require(
        booking_journal.get("state") == "acknowledged"
        and booking_journal.get("definitionSha") == expected_definition_sha
        and booking_journal.get("runtimeSha") == expected_runtime_sha
        and booking_journal.get("entrySlug") == ENTRY_SLUG
        and booking_journal.get("partnerUserRef") == SUBJECT,
        "r14-booking-journal-custody-invalid",
    )

    require(
        evidence.get("mode") == "full-journey"
        and evidence.get("definitionSha") == expected_definition_sha
        and evidence.get("runtimeSha") == expected_runtime_sha
        and evidence.get("entrySlug") == ENTRY_SLUG
        and evidence.get("subject") == SUBJECT
        and evidence.get("completed") is True
        and evidence.get("mainOrderCompleted") is True
        and evidence.get("cleanupErrors") == [],
        "r14-evidence-envelope-or-cleanup-invalid",
    )
    finalization = evidence.get("finalization")
    require(
        isinstance(finalization, dict) and finalization.get("wholeRunPassed") is True,
        "r14-evidence-finalization-not-passed",
    )
    booking_write = evidence.get("bookingWrite")
    require(
        isinstance(booking_write, dict) and booking_write.get("state") == "acknowledged",
        "r14-evidence-unknown-booking-ack",
    )
    body_sha = booking_write.get("bodySha256")
    require(
        isinstance(body_sha, str)
        and bool(SHA64_RE.match(body_sha))
        and booking_journal.get("bodySha256") == body_sha
        and (
            "body" not in booking_journal
            or (
                isinstance(booking_journal.get("body"), str)
                and hashlib.sha256(booking_journal["body"].encode("utf-8")).hexdigest()
                == body_sha
            )
        ),
        "r14-booking-journal-member-sha-mismatch",
    )
    rating_write = evidence.get("browserRatingWrite")
    require(
        rating_write is None
        or (isinstance(rating_write, dict) and rating_write.get("state") == "acknowledged"),
        "r14-evidence-unknown-rating-ack",
    )

    require(
        isinstance(stage_a, dict) and set(stage_a.keys()) == STAGE_A_REQUIRED_KEYS,
        "r14-stage-a-schema-keys-invalid",
    )
    _assert_no_secret_material(stage_a)

    require(
        stage_a.get("schema") == STAGE_A_SCHEMA
        and stage_a.get("stage") == "stageA"
        and stage_a.get("repository") == REPOSITORY
        and stage_a.get("definitionSha") == expected_definition_sha
        and stage_a.get("runtimeSha") == expected_runtime_sha
        and stage_a.get("entrySlug") == ENTRY_SLUG
        and stage_a.get("subject") == SUBJECT
        and stage_a.get("fleetPartnerId") == FLEET_PARTNER_ID
        and stage_a.get("tenantId") == TENANT_ID
        and isinstance(stage_a.get("nonce"), str)
        and bool(stage_a["nonce"].strip())
        and stage_a.get("nonce") == evidence.get("nonce"),
        "r14-stage-a-identity-binding-mismatch",
    )

    approved_date = stage_a.get("approvedUtcDate")
    require(
        isinstance(approved_date, str) and bool(DATE_ONLY_RE.match(approved_date)),
        "r14-stage-a-approved-date-invalid",
    )
    require(
        approved_date < current_utc_date,
        "r14-stage-a-not-yet-expired-utc-rollover-required"
        if approved_date == current_utc_date
        else "r14-stage-a-future-approved-date",
    )

    driver_id = stage_a.get("driverId")
    vehicle_id = stage_a.get("vehicleId")
    plate_no = stage_a.get("plateNo")
    driver_sub_id = stage_a.get("driverSubmissionId")
    vehicle_sub_id = stage_a.get("vehicleSubmissionId")
    contract_id = stage_a.get("canonicalContractId")
    policy_id = stage_a.get("canonicalPolicyId")

    for field_name, val in (
        ("driverId", driver_id),
        ("vehicleId", vehicle_id),
        ("plateNo", plate_no),
        ("driverSubmissionId", driver_sub_id),
        ("vehicleSubmissionId", vehicle_sub_id),
        ("canonicalContractId", contract_id),
        ("canonicalPolicyId", policy_id),
    ):
        require(
            isinstance(val, str) and bool(SAFE_ID_RE.match(val)),
            f"r14-stage-a-{field_name}-invalid",
        )
    require(
        driver_id != vehicle_id
        and driver_sub_id != vehicle_sub_id
        and contract_id != policy_id
        and str(plate_no).startswith("SIM-"),
        "r14-stage-a-canonical-id-collision-or-plate",
    )

    events = evidence.get("events")
    require(isinstance(events, list), "r14-evidence-events-required")
    exclusivity_matched = any(
        isinstance(evt, dict)
        and evt.get("stage") == "own-supply-exclusivity-approved"
        and evt.get("driverId") == driver_id
        and evt.get("vehicleId") == vehicle_id
        for evt in events
    )
    order_created_matched = any(
        isinstance(evt, dict)
        and evt.get("stage") == "owned-public-Demo-order-created"
        and evt.get("driverId") == driver_id
        and evt.get("vehicleId") == vehicle_id
        for evt in events
    )
    require(
        exclusivity_matched and order_created_matched,
        "r14-stage-a-own-pair-events-unverified",
    )

    expected_end_iso = f"{approved_date}T23:59:59.000Z"
    exclusivity_end = stage_a.get("exclusivityEffectiveEnd")
    require(
        stage_a.get("professionalDriverLicenseExpiry") == approved_date
        and stage_a.get("taxiDriverRegistrationExpiry") == approved_date
        and stage_a.get("contractEndAt") == expected_end_iso
        and stage_a.get("policyEndAt") == expected_end_iso
        and isinstance(exclusivity_end, str)
        and exclusivity_end.endswith("T23:59:59.000Z")
        and bool(DATE_ONLY_RE.match(exclusivity_end[:10]))
        and exclusivity_end[:10] > current_utc_date,
        "r14-stage-a-expiry-dates-mismatch",
    )

    documents = stage_a.get("documents")
    require(
        isinstance(documents, list) and len(documents) == 5,
        "r14-stage-a-five-documents-required",
    )
    seen_doc_types: set[str] = set()
    seen_doc_ids: set[str] = set()
    for doc in documents:
        require(
            isinstance(doc, dict) and set(doc.keys()) == DOCUMENT_REQUIRED_KEYS,
            "r14-stage-a-document-shape-invalid",
        )
        doc_id = doc.get("documentId")
        doc_type = doc.get("documentType")
        doc_sub_id = doc.get("submissionId")
        eff_from = doc.get("effectiveFrom")
        eff_until = doc.get("effectiveUntil")
        sha = doc.get("sha256")
        readback_sha = doc.get("readbackSha256")
        scan_state = doc.get("scanState")
        doc_bytes = doc.get("bytes")
        review_status = doc.get("reviewStatus")

        require(
            isinstance(doc_id, str)
            and bool(SAFE_ID_RE.match(doc_id))
            and doc_id not in seen_doc_ids,
            "r14-stage-a-document-id-invalid",
        )
        seen_doc_ids.add(doc_id)
        require(
            isinstance(doc_type, str)
            and doc_type in REQUIRED_ALL_DOC_TYPES
            and doc_type not in seen_doc_types,
            "r14-stage-a-document-type-invalid",
        )
        seen_doc_types.add(doc_type)
        expected_sub_id = (
            driver_sub_id if doc_type in REQUIRED_DRIVER_DOC_TYPES else vehicle_sub_id
        )
        require(
            doc_sub_id == expected_sub_id,
            "r14-stage-a-document-submission-mismatch",
        )
        require(
            isinstance(eff_from, str)
            and bool(DATE_ONLY_RE.match(eff_from))
            and eff_from <= approved_date
            and eff_until == approved_date,
            "r14-stage-a-document-effective-dates-invalid",
        )
        require(
            isinstance(sha, str)
            and bool(SHA64_RE.match(sha))
            and sha == readback_sha,
            "r14-stage-a-document-sha-invalid",
        )
        require(
            scan_state == "clean"
            and review_status == "approved"
            and isinstance(doc_bytes, int)
            and not isinstance(doc_bytes, bool)
            and doc_bytes > 0,
            "r14-stage-a-document-scan-or-approval-invalid",
        )

    require(
        seen_doc_types == REQUIRED_ALL_DOC_TYPES,
        "r14-stage-a-document-type-set-incomplete",
    )

    approvals = stage_a.get("approvals")
    require(
        isinstance(approvals, dict) and set(approvals.keys()) == {"driver", "vehicle"},
        "r14-stage-a-approvals-shape-invalid",
    )
    for kind, expected_sub in (("driver", driver_sub_id), ("vehicle", vehicle_sub_id)):
        item = approvals.get(kind)
        require(isinstance(item, dict), f"r14-stage-a-{kind}-approval-invalid")
        submitted_by = item.get("submittedBy")
        reviewed_by = item.get("reviewedBy")
        approved_at = item.get("approvedAt")
        revision_no = item.get("revisionNo")
        require(
            item.get("submissionId") == expected_sub
            and item.get("status") == "approved"
            and isinstance(submitted_by, str)
            and bool(SAFE_ID_RE.match(submitted_by))
            and isinstance(reviewed_by, str)
            and bool(SAFE_ID_RE.match(reviewed_by))
            and submitted_by != reviewed_by
            and isinstance(approved_at, str)
            and approved_at.startswith(approved_date)
            and isinstance(revision_no, int)
            and not isinstance(revision_no, bool)
            and revision_no >= 1,
            f"r14-stage-a-{kind}-approval-fields-invalid",
        )
    vehicle_approval = approvals["vehicle"]
    require(
        vehicle_approval.get("sourceContractSubmissionId") == vehicle_sub_id
        and vehicle_approval.get("sourcePolicySubmissionId") == vehicle_sub_id,
        "r14-stage-a-vehicle-source-submission-binding-invalid",
    )

    cleanup = stage_a.get("cleanup")
    require(
        isinstance(cleanup, dict)
        and cleanup.get("driverWorkStateOffline") is True
        and cleanup.get("driverBindingRevoked") is True
        and cleanup.get("fleetSessionCleaned") is True
        and cleanup.get("mainOrderCompleted") is True
        and cleanup.get("secondSupplyProvisioned") is True
        and cleanup.get("cleanupErrors") == [],
        "r14-stage-a-cleanup-state-invalid",
    )

    return dict(stage_a)


def validate_candidate_artifact(
    metadata: dict,
    run_detail: dict,
    archive: bytes,
    *,
    expected_definition_sha: str,
    expected_runtime_sha: str,
    current_utc_date: str,
) -> dict:
    require(isinstance(metadata, dict), "r14-artifact-metadata-invalid")
    require(metadata.get("expired") is False, "r14-artifact-expired")
    artifact_id = metadata.get("id")
    artifact_name = metadata.get("name")
    size_in_bytes = metadata.get("size_in_bytes")
    digest = metadata.get("digest")
    workflow_run = metadata.get("workflow_run")

    require(
        isinstance(artifact_id, int)
        and not isinstance(artifact_id, bool)
        and artifact_id > 0
        and isinstance(artifact_name, str)
        and isinstance(size_in_bytes, int)
        and not isinstance(size_in_bytes, bool)
        and size_in_bytes > 0
        and isinstance(digest, str)
        and digest.startswith("sha256:")
        and bool(SHA64_RE.match(digest[7:]))
        and isinstance(workflow_run, dict),
        "r14-artifact-metadata-fields-invalid",
    )
    name_match = ARTIFACT_NAME_RE.match(artifact_name)
    require(name_match is not None, "r14-artifact-name-mismatch")
    name_runtime_sha, name_run_id_str = name_match.groups()
    run_id = int(name_run_id_str)

    require(
        name_runtime_sha == expected_runtime_sha
        and workflow_run.get("id") == run_id
        and workflow_run.get("head_sha") == expected_definition_sha
        and isinstance(workflow_run.get("head_branch"), str)
        and bool(workflow_run["head_branch"].strip()),
        "r14-artifact-run-or-sha-mismatch",
    )

    require(isinstance(run_detail, dict), "r14-run-detail-invalid")
    repo_info = run_detail.get("repository")
    workflow_path = run_detail.get("path")
    require(
        run_detail.get("id") == run_id
        and run_detail.get("head_sha") == expected_definition_sha
        and run_detail.get("event") == "workflow_dispatch"
        and run_detail.get("status") == "completed"
        and run_detail.get("conclusion") == "success"
        and (
            repo_info is None
            or (isinstance(repo_info, dict) and repo_info.get("full_name") == REPOSITORY)
        )
        and (
            workflow_path is None
            or (
                isinstance(workflow_path, str)
                and workflow_path.split("@", 1)[0].endswith(WORKFLOW_PATH_SUFFIX)
            )
        ),
        "r14-run-identity-or-state-mismatch",
    )

    extracted = validate_archive_and_extract_evidence(
        archive,
        expected_size=size_in_bytes,
        expected_digest=digest,
    )
    evidence = extracted["evidence"]

    if evidence.get("mode") == "recovery-only" and evidence.get("r14StageA") is None:
        return {"relevant": False}

    stage_a = evidence.get("r14StageA")
    require(stage_a is not None, "r14-stage-a-projection-missing")
    validated_target = validate_stage_a_projection(
        stage_a,
        evidence,
        extracted["bookingJournal"],
        extracted["runtimeBefore"],
        extracted["runtimeAfter"],
        expected_definition_sha=expected_definition_sha,
        expected_runtime_sha=expected_runtime_sha,
        current_utc_date=current_utc_date,
    )

    return {
        "relevant": True,
        "officialArtifact": {
            "runId": run_id,
            "artifactId": artifact_id,
            "artifactName": artifact_name,
            "headSha": expected_definition_sha,
            "headBranch": workflow_run["head_branch"],
            "archiveBytes": extracted["archiveBytes"],
            "archiveSha256": extracted["archiveSha256"],
            "memberCount": extracted["memberCount"],
            "journeyEvidenceBytes": extracted["journeyEvidenceBytes"],
            "journeyEvidenceSha256": extracted["journeyEvidenceSha256"],
            "runtimeBeforeSha256": extracted["runtimeBeforeSha256"],
            "runtimeAfterSha256": extracted["runtimeAfterSha256"],
            "bookingJournalSha256": extracted["bookingJournalSha256"],
        },
        "target": validated_target,
    }


def dispatched_runs_path(current_utc_date: str, page: int) -> str:
    since = (
        datetime.strptime(current_utc_date, "%Y-%m-%d")
        - timedelta(days=RUN_WINDOW_DAYS)
    ).strftime("%Y-%m-%d")
    return (
        f"repos/{REPOSITORY}/actions/workflows/{WORKFLOW_FILE}/runs"
        f"?event=workflow_dispatch&created=%3E%3D{since}&per_page={PER_PAGE}&page={page}"
    )


def run_artifacts_path(run_id: int) -> str:
    return f"repos/{REPOSITORY}/actions/runs/{run_id}/artifacts?per_page={ARTIFACTS_PER_RUN}"


def read_run_artifacts(run_id: int, fetch_json) -> list[dict]:
    listing = fetch_json(run_artifacts_path(run_id))
    require(
        isinstance(listing, dict) and isinstance(listing.get("artifacts"), list),
        "r14-artifact-listing-invalid",
    )
    items = listing["artifacts"]
    require(
        listing.get("total_count") == len(items),
        "r14-artifact-inspection-bound-exceeded",
    )
    require(
        all(isinstance(item, dict) for item in items),
        "r14-artifact-listing-item-invalid",
    )
    return items


def journey_jobs_path(run_id: int) -> str:
    return f"repos/{REPOSITORY}/actions/runs/{run_id}/jobs?filter=all&per_page={JOBS_PER_RUN}"


def journey_job_ever_passed(run_id: int, fetch_json) -> bool:
    """Whether any attempt of the run's journey job passed, whatever the run concluded."""
    listing = fetch_json(journey_jobs_path(run_id))
    require(
        isinstance(listing, dict) and isinstance(listing.get("jobs"), list),
        "r14-job-listing-invalid",
    )
    jobs = listing["jobs"]
    require(
        listing.get("total_count") == len(jobs)
        and all(isinstance(job, dict) for job in jobs),
        "r14-job-listing-incomplete",
    )
    return any(
        job.get("name") == JOURNEY_JOB and job.get("conclusion") == "success"
        for job in jobs
    )


def _names_this_release(item: dict, run_id: int, definition_sha: str, runtime_sha: str) -> bool:
    workflow_run = item.get("workflow_run")
    return (
        item.get("name") == f"owned-referral-business-{runtime_sha}-{run_id}"
        and isinstance(workflow_run, dict)
        and workflow_run.get("head_sha") == definition_sha
    )


def _matching_artifact_id(
    item: dict,
    run_id: int,
    *,
    expected_definition_sha: str,
    expected_runtime_sha: str,
) -> int | None:
    name = item.get("name")
    if not isinstance(name, str) or not name.startswith("owned-referral-business-"):
        return None
    match = ARTIFACT_NAME_RE.match(name)
    require(match is not None, "r14-artifact-name-malformed")
    artifact_runtime, run_id_str = match.groups()
    workflow_run = item.get("workflow_run")
    require(isinstance(workflow_run, dict), "r14-artifact-workflow-run-missing")
    head_sha = workflow_run.get("head_sha")
    if artifact_runtime != expected_runtime_sha:
        require(head_sha != expected_definition_sha, "r14-artifact-runtime-mismatch")
        return None
    require(head_sha == expected_definition_sha, "r14-artifact-head-sha-mismatch")
    require(
        int(run_id_str) == run_id and workflow_run.get("id") == run_id,
        "r14-artifact-run-or-sha-mismatch",
    )
    require(item.get("expired") is False, "r14-artifact-expired")
    artifact_id = item.get("id")
    require(
        isinstance(artifact_id, int)
        and not isinstance(artifact_id, bool)
        and artifact_id > 0,
        "r14-artifact-id-invalid-or-duplicate",
    )
    return artifact_id


def discover_prior_owned_target(
    *,
    expected_definition_sha: str,
    expected_runtime_sha: str,
    current_run_id: int,
    current_utc_date: str,
    fetch_json,
    fetch_bytes,
) -> dict:
    require(bool(SHA40_RE.match(expected_definition_sha)), "r14-expected-definition-sha-invalid")
    require(bool(SHA40_RE.match(expected_runtime_sha)), "r14-expected-runtime-sha-invalid")
    require(
        isinstance(current_run_id, int)
        and not isinstance(current_run_id, bool)
        and current_run_id > 0,
        "r14-current-run-id-invalid",
    )
    require(bool(DATE_ONLY_RE.match(current_utc_date)), "r14-current-utc-date-invalid")

    candidate_artifacts: list[tuple[int, dict]] = []
    seen_run_ids: set[int] = set()
    seen_artifact_ids: set[int] = set()
    expected_run_count: int | None = None

    for page in range(1, MAX_PAGES + 2):
        listing = fetch_json(dispatched_runs_path(current_utc_date, page))
        require(
            isinstance(listing, dict)
            and isinstance(listing.get("workflow_runs"), list)
            and isinstance(listing.get("total_count"), int),
            "r14-run-listing-invalid",
        )
        runs = listing["workflow_runs"]
        if expected_run_count is None:
            expected_run_count = listing["total_count"]
        require(page <= MAX_PAGES or not runs, "r14-run-listing-bound-exceeded")
        for run in runs:
            run_id = run.get("id") if isinstance(run, dict) else None
            require(
                isinstance(run_id, int) and not isinstance(run_id, bool) and run_id > 0,
                "r14-run-listing-item-invalid",
            )
            # A run pushed to the next page by a newer dispatch is listed twice.
            if run_id in seen_run_ids:
                continue
            seen_run_ids.add(run_id)
            if run_id == current_run_id:
                continue
            artifacts = read_run_artifacts(run_id, fetch_json)
            if run.get("status") == "completed" and run.get("conclusion") != "success":
                # Evidence of a journey that itself failed is not a target. One that
                # passed in a run that failed elsewhere may be, and cannot be read
                # as an official result; re-running the failed jobs resolves it.
                require(
                    not any(
                        _names_this_release(
                            item, run_id, expected_definition_sha, expected_runtime_sha
                        )
                        for item in artifacts
                    )
                    or not journey_job_ever_passed(run_id, fetch_json),
                    "r14-passed-journey-in-unsuccessful-run",
                )
                continue
            matching: dict[int, dict] = {}
            for artifact in artifacts:
                artifact_id = _matching_artifact_id(
                    artifact,
                    run_id,
                    expected_definition_sha=expected_definition_sha,
                    expected_runtime_sha=expected_runtime_sha,
                )
                if artifact_id is None:
                    continue
                require(
                    artifact_id not in seen_artifact_ids,
                    "r14-artifact-id-invalid-or-duplicate",
                )
                seen_artifact_ids.add(artifact_id)
                matching[artifact_id] = artifact
            if matching:
                # Each attempt of a re-run job uploads under the same name; the
                # newest belongs to the attempt that made the run succeed.
                candidate_artifacts.append((run_id, matching[max(matching)]))
        if len(runs) < PER_PAGE:
            break

    require(
        expected_run_count is not None
        and len(seen_run_ids) >= expected_run_count
        and current_run_id in seen_run_ids,
        "r14-run-listing-incomplete",
    )
    require(
        len(candidate_artifacts) <= MAX_CANDIDATE_RUNS,
        "r14-candidate-run-bound-exceeded",
    )

    valid_candidates: list[dict] = []
    for run_id, item in candidate_artifacts:
        artifact_id = item["id"]
        size_in_bytes = item.get("size_in_bytes")
        require(
            isinstance(size_in_bytes, int)
            and not isinstance(size_in_bytes, bool)
            and 0 < size_in_bytes <= MAX_ARCHIVE_BYTES,
            "r14-artifact-size-bounds",
        )
        metadata = fetch_json(f"repos/{REPOSITORY}/actions/artifacts/{artifact_id}")
        run_detail = fetch_json(f"repos/{REPOSITORY}/actions/runs/{run_id}")
        archive = fetch_bytes(
            f"repos/{REPOSITORY}/actions/artifacts/{artifact_id}/zip",
            size_in_bytes,
        )
        validated = validate_candidate_artifact(
            metadata,
            run_detail,
            archive,
            expected_definition_sha=expected_definition_sha,
            expected_runtime_sha=expected_runtime_sha,
            current_utc_date=current_utc_date,
        )
        if validated.get("relevant"):
            valid_candidates.append(validated)

    require(
        len(valid_candidates) <= 1,
        "r14-duplicate-stage-a-target-lineage",
    )

    if not valid_candidates:
        return {
            "schema": MANIFEST_SCHEMA,
            "decision": "stageA",
            "repository": REPOSITORY,
            "definitionSha": expected_definition_sha,
            "runtimeSha": expected_runtime_sha,
            "evaluatedUtcDate": current_utc_date,
            "candidateCount": 0,
            "officialArtifact": None,
            "target": None,
        }

    chosen = valid_candidates[0]
    return {
        "schema": MANIFEST_SCHEMA,
        "decision": "stageB",
        "repository": REPOSITORY,
        "definitionSha": expected_definition_sha,
        "runtimeSha": expected_runtime_sha,
        "evaluatedUtcDate": current_utc_date,
        "candidateCount": 1,
        "officialArtifact": chosen["officialArtifact"],
        "target": chosen["target"],
    }


def gh_read_bytes(path: str, limit: int = MAX_JSON_BYTES) -> bytes:
    result = subprocess.run(
        ["gh", "api", path],
        capture_output=True,
        timeout=60,
        check=False,
    )
    require(result.returncode == 0, "r14-gh-api-read-unavailable")
    require(len(result.stdout) <= limit, "r14-gh-api-read-bounds")
    return result.stdout


def gh_read_json(path: str) -> dict:
    raw = gh_read_bytes(path, MAX_JSON_BYTES)
    try:
        parsed = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        raise R14TargetError("r14-gh-api-json-invalid") from None
    require(isinstance(parsed, dict), "r14-gh-api-json-object-required")
    return parsed


def write_private_manifest(path: Path, manifest: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if path.exists():
        path.unlink()
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    descriptor = os.open(path, flags, 0o600)
    payload = f"{json.dumps(manifest, indent=2)}\n".encode("utf-8")
    with os.fdopen(descriptor, "wb") as handle:
        handle.write(payload)
        handle.flush()
        os.fsync(handle.fileno())


def main() -> None:
    require(
        os.environ.get("GITHUB_ACTIONS") == "true"
        and os.environ.get("OWNED_REFERRAL_HOSTED_OPT_IN") == "true"
        and os.environ.get("OWNED_REFERRAL_RECOVERY_ONLY", "false").lower() == "false"
        and os.environ.get("GITHUB_REPOSITORY") == REPOSITORY
        and bool(os.environ.get("GH_TOKEN", "").strip()),
        "r14-normal-full-hosted-opt-in-required",
    )
    definition_sha = os.environ.get("EXPECTED_DEFINITION_SHA", "")
    runtime_sha = os.environ.get("EXPECTED_RUNTIME_SHA", "")
    run_id_raw = os.environ.get("GITHUB_RUN_ID", "")
    require(
        run_id_raw.isdigit() and int(run_id_raw) > 0,
        "r14-github-run-id-required",
    )
    current_utc_date = os.environ.get("R14_EVALUATED_UTC_DATE") or datetime.now(
        timezone.utc
    ).strftime("%Y-%m-%d")
    output_path = Path(
        os.environ.get("OWNED_R14_PRIOR_TARGET_MANIFEST", str(DEFAULT_OUTPUT))
    )

    manifest = discover_prior_owned_target(
        expected_definition_sha=definition_sha,
        expected_runtime_sha=runtime_sha,
        current_run_id=int(run_id_raw),
        current_utc_date=current_utc_date,
        fetch_json=gh_read_json,
        fetch_bytes=gh_read_bytes,
    )
    write_private_manifest(output_path, manifest)
    print(
        json.dumps(
            {
                "r14PriorTargetVerified": True,
                "decision": manifest["decision"],
                "candidateCount": manifest["candidateCount"],
                "evaluatedUtcDate": manifest["evaluatedUtcDate"],
            }
        )
    )


if __name__ == "__main__":
    try:
        require(len(sys.argv) == 1, "r14-prior-target-arguments-refused")
        main()
    except Exception as error:
        code = (
            str(error)
            if isinstance(error, R14TargetError)
            else "r14-prior-target-read-failed"
        )
        print(json.dumps({"r14PriorTargetVerified": False, "code": code}))
        raise SystemExit(1)
