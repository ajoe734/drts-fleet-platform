# UAT: GCP Artifact Activation 20261004

This document captures the User Acceptance Testing for the `SR-GCP-ARTIFACT-ACTIVATION-20261004` task.

## Review Findings (Codex - PR 2313)
The initial implementation of `2fa1f87dd402e6d41e4844275ef93c1e74c4ff93` received several findings that have since been remediated:
- **R1:** The provisioning workflow accepted a mutable tag as `source_ref` instead of enforcing a full 40-character SHA. Now enforces regex and validates `HEAD`.
- **R2:** Identity tokens for the WIF runtime were using `external_account` credentials (impersonation). Now securely passes token via `SCANNER_ID_TOKEN` and uses `id_token` token_format.
- **R3:** The scanner verification script was using `application/octet-stream`, violating the product MIME policy. Now sends valid PDF EICAR and clean PDF files with `application/pdf`.
- **R4:** The modified retired cleanup scripts broke deployment health guards by making the scanner presence strictly required instead of optional. Now explicitly allowed as an optional inventory entry.
- **R5:** Scanner verification assertions were incomplete, allowing invalid receipts to pass (ignoring sha256/sizeBytes). Now properly tests correlation and expected failure cases.
- **R6:** GCS verification allowed failing uploads to masquerade as CAS enforcement success and omitted download assertions. Now tests exact generation updates, Precondition Failed on mismatch, and reads back immutable prior generation content.
- **R7:** The Python test was not running in CI. Now integrated with `test_verify_dev_artifact_backends.py` in the required CI path.
- **R8:** The UAT evidence (this document) overstated implemented verification. It now separates offline/source results from pending hosted operator checks.

## Acceptance Criteria

### 1. immutable_hosted_workflow_review_ci
- **Requirement:** Independently reviewed exact SHA and CI, no mutable code dispatch.
- **Source/Offline Result:**
  - `provision-dev-artifact-backends.yml` strictly enforces 40-character SHA matching checked-out HEAD before side effects.
  - CI path covers `verify-dev-artifact-backends.py` with mock tests to enforce code coverage.
- **Pending Hosted Checks:**
  - Verify CI passes on the final candidate PR.
  - Reviewer approval must be granted before the workflow is dispatched via exact SHA.

### 2. private_resources_iam_and_image_provenance
- **Requirement:** Real digests, project/region/runtime ownership, private buckets/versioning and least-privilege IAM/readback, scanner not anonymous; bounded support instance.
- **Source/Offline Result:**
  - IAM assertions target correct service accounts.
  - Inventory check in `cleanup-retired-dev-service.sh` explicitly supports `drts-dev-scanner` as an optional service.
- **Pending Hosted Checks:**
  - Dispatch workflow with valid SHA.
  - After provisioning, execute `gcloud storage buckets describe` on document/remittance buckets to verify `uniformBucketLevelAccess`, `versioning: enabled`, and no `allUsers` bindings.
  - Execute `gcloud run services get-iam-policy drts-dev-scanner` to verify it denies unauthenticated access.
  - Record the actual `imageDigest` deployed from `gcloud run services describe`.

### 3. genuine_scan_storage_positive_negative
- **Requirement:** Actual clean/EICAR, hash/size/limit/error/freshness rejection, authenticated GCS CAS/generation readback using test-owned objects only.
- **Source/Offline Result:**
  - `verify-dev-artifact-backends.py` implements complete testing with `application/pdf` EICAR payloads, CAS precondition handling, and UUID-based scoping.
- **Pending Hosted Checks:**
  - The provisioning workflow's "Verify Hosted Backends" step automatically runs the Python helper against the live infrastructure, minting its own valid ID token.
  - Operators can manually run the script if authorized.

### 4. shared_dev_provider_activation_readback
- **Requirement:** Configure reviewed GCS/scanner provider refs through authorized rails, coordinate an immutable shared dev deployment.
- **Source/Offline Result:**
  - Not yet modified until Gate 3 succeeds.
- **Pending Hosted Checks:**
  - Once backends are verified, update `DEV_DOCUMENT_ARTIFACT` and `DEV_REMITTANCE_PROOF` repository variables to point to the created buckets.
  - Configure the application to use the provisioned backend services and dispatch `deploy-dev.yml`.
  - Validate functionality in the actual shared dev application.
