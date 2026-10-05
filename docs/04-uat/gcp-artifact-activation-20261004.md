# UAT: GCP Artifact Activation 20261004

This document captures the User Acceptance Testing for the `SR-GCP-ARTIFACT-ACTIVATION-20261004` task.

## Review Findings (Codex - PR 2313)

The initial implementation of `2fa1f87dd402e6d41e4844275ef93c1e74c4ff93` received several findings that have since been remediated:
- **R1:** The provisioning workflow accepted a mutable tag as `source_ref` instead of enforcing a full 40-character SHA. Now enforces regex and validates `HEAD`.
- **R2:** Identity tokens for the WIF runtime were using `external_account` credentials (impersonation). Now securely passes token via `SCANNER_ID_TOKEN` and uses `id_token` token_format.
- **R3:** The scanner verification script was using `application/octet-stream`, violating the product MIME policy. Now sends valid PDF EICAR and clean PDF files with `application/pdf`.
- **R4:** The modified retired cleanup scripts broke deployment health guards by making the scanner presence strictly required instead of optional. Now explicitly allowed as an optional inventory entry.
- **R7:** The Python test was not running in CI. Now integrated with `test_verify_dev_artifact_backends.py` in the required CI path.
- **R9:** Commit trailers check fixed and passed in CI.

### Guide 0.7 Resolution Table for Remaining Findings & Gates

| Finding / Gate | Adjacent SHA | Command | Result / Artifacts | Pending Limits |
|---|---|---|---|---|
| **R5a (Gateway Errors)** | `HEAD` | `python3 -m unittest tools.ci.test_verify_dev_artifact_backends` | PASS. `content_sha256_mismatch` and `payload_too_large` correctly expected. | Offline verified. Requires hosted API hit. |
| **R5b (Genuine Engine)** | `HEAD` | Manual offline checks | Acceptance boundary defined. Added explicit unexecuted genuine engine scenarios to test output (fault injection/recovery). Tests use genuine engine only in hosted authorized environment. | Needs execution of manual fault/recovery scenarios in shared dev after merge. |
| **R6 (GCS Robustness)** | `HEAD` | `python3 -m unittest tools.ci.test_verify_dev_artifact_backends` | PASS. Added gen2 byte download, unchanged winner validation, stale write, malformed gen, network error and exact gen cleanup. Helper executes as runtime SA via explicit impersonation. | Execution required against live GCS via hosted verification workflow. |
| **R8 (Prerequisites)** | `HEAD` | Checked workflow | `.github/workflows/provision-dev-artifact-backends.yml` validates and bootstraps Scanner SA, and explicitly verifies actAs/TokenCreator prerequisites for runtime SA before provisioning. | Pending verification of IAM policies/readbacks during provisioning. |
| **1. immutable_hosted_workflow_review_ci** | `HEAD` | Git / CI Checks | Workflow ensures `source_ref` immutable validation and mock tests are part of CI. | Pending reviewer approval and final CI pass on PR. |
| **2. private_resources_iam_and_image_provenance** | `HEAD` | Offline scripts | Scripts configured for private buckets and IAM policies. | Pending readback of runtime SA ownership/access, `imageDigest`, memory limits in hosted environment. |
| **3. genuine_scan_storage_positive_negative** | `HEAD` | Unit tests | `verify-dev-artifact-backends.py` completes tests for clean, EICAR, mismatch, oversize, CAS handling. | Pending hosted verification using genuine `clamd` sidecar. |
| **4. shared_dev_provider_activation_readback** | `HEAD` | Offline prep | N/A | Update `DEV_DOCUMENT_ARTIFACT_STORAGE_PROVIDER`, `DEV_DOCUMENT_ARTIFACT_GCS_BUCKET`, `DEV_REMITTANCE_PROOF_STORAGE_PROVIDER`, `DEV_REMITTANCE_PROOF_GCS_BUCKET`, `DEV_REMITTANCE_PROOF_SCANNER_PROVIDER`, `DEV_REMITTANCE_PROOF_SCANNER_URL` variables. |

## Acceptance Criteria

### 1. immutable_hosted_workflow_review_ci
- **Requirement:** Independently reviewed exact SHA and CI, no mutable code dispatch.
- **Pending Hosted Checks:**
  - Verify CI passes on the final candidate PR.
  - Reviewer approval must be granted before the workflow is dispatched via exact SHA.

### 2. private_resources_iam_and_image_provenance
- **Requirement:** Real digests, project/region/runtime ownership, private buckets/versioning and least-privilege IAM/readback, scanner not anonymous; bounded support instance.
- **Pending Hosted Checks:**
  - Dispatch workflow with valid SHA.
  - Verify scanner SA exists and workflow identity can `actAs` it.
  - Execute `gcloud storage buckets get-iam-policy` to read back IAM and verify concrete runtime SA ownership.
  - Execute `gcloud run services get-iam-policy drts-dev-scanner` to verify it denies unauthenticated access.
  - Record the actual `imageDigest` deployed, memory (512Mi/4Gi), min(0), max(1) and concurrency(1).

### 3. genuine_scan_storage_positive_negative
- **Requirement:** Actual clean/EICAR, hash/size/limit/error/freshness rejection, authenticated GCS CAS/generation readback using test-owned objects only.
- **Pending Hosted Checks:**
  - The provisioning workflow's "Verify Hosted Backends" step automatically runs the Python helper against the live infrastructure, minting its own valid ID token.
  - Execute genuine engine fault scenarios (e.g. engine down) explicitly to verify `scan_engine_unavailable` or `not_ready` behaviour.

### 4. shared_dev_provider_activation_readback
- **Requirement:** Configure reviewed GCS/scanner provider refs through authorized rails, coordinate an immutable shared dev deployment.
- **Pending Hosted Checks:**
  - Once backends are verified, update the 6 specific repository variables (`_PROVIDER`, `_GCS_BUCKET`, `_SCANNER_URL`) for Document Artifact and Remittance Proof providers.
  - Configure the application to use the provisioned backend services and dispatch `deploy-dev.yml`.
  - Validate functionality in the actual shared dev application.
