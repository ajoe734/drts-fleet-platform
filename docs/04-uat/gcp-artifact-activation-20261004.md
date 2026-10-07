# UAT: GCP Artifact Activation 20261004

This document captures the User Acceptance Testing for the `SR-GCP-ARTIFACT-ACTIVATION-20261004` task.

## Review Findings (Codex - PR 2313)

The initial implementation of `2fa1f87dd402e6d41e4844275ef93c1e74c4ff93` received several findings that have since been remediated:
- **R1:** The provisioning workflow accepted a mutable tag as `source_ref` instead of enforcing a full 40-character SHA. Now enforces regex and validates exact candidate SHA.
- **R2:** Identity tokens for the WIF runtime were using `external_account` credentials (impersonation). Now securely passes token via `SCANNER_ID_TOKEN` and uses `id_token` token_format.
- **R3:** The scanner verification script was using `application/octet-stream`, violating the product MIME policy. Now sends valid PDF EICAR and clean PDF files with `application/pdf`.
- **R4:** The modified retired cleanup scripts broke deployment health guards by making the scanner presence strictly required instead of optional. Now explicitly allowed as an optional inventory entry.
- **R7:** The Python test was not running in CI. Now integrated with `test_verify_dev_artifact_backends.py` in the required CI path.
- **R9:** Commit trailers failure from 1fa843531cae eliminated via branch history recovery and trailing whitespaces repaired.

### Guide 0.7 Resolution Table for Remaining Findings & Gates

| Finding / Gate | Adjacent SHA | Current Candidate SHA | Command / Assertion | Result / Artifacts |
|---|---|---|---|---|
| **R5a/R5b/R6 (Gateway/Engine/GCS)** | `94cfa11b9` | `658824e059fbbe0f49d358a7af275879d0ba0c32` | `python3 -B -m unittest tools.ci.test_verify_dev_artifact_backends` | PASS (exit 0). Includes real `scan_engine_not_ready` regression assertions, `Heuristics.Limits.Exceeded` (archive >10MB uncompressed) engine limit rejection payload, and genuine Cloud Run readiness transition orchestrations. |
| **R8 (Prerequisites)** | `94cfa11b9` | `658824e059fbbe0f49d358a7af275879d0ba0c32` | Checked `.github/workflows/provision-dev-artifact-backends.yml` | Redundant grant removed. Explicit `NOT_FOUND` condition checked before SA creation. |
| **1. immutable_hosted_workflow_review_ci** | `94cfa11b9` | `658824e059fbbe0f49d358a7af275879d0ba0c32` | Git / CI Checks | Workflow ensures `source_ref` immutable validation and mock tests are part of CI. Final CI pass pending on PR. |
| **2. private_resources_iam_and_image_provenance** | `94cfa11b9` | `658824e059fbbe0f49d358a7af275879d0ba0c32` | Hosted runbacks | `gcloud storage buckets get-iam-policy gs://$DEV_GCP_PROJECT_ID-document-artifacts`, `gcloud run services get-iam-policy drts-dev-scanner` and curl anonymous tests |
| **3. genuine_scan_storage_positive_negative** | `94cfa11b9` | `658824e059fbbe0f49d358a7af275879d0ba0c32` | Hosted verification run | Workflow automatically runs `verify-dev-artifact-backends.py` in live GCP environment |
| **4. shared_dev_provider_activation_readback** | `94cfa11b9` | `658824e059fbbe0f49d358a7af275879d0ba0c32` | Live deployment | Configure the 6 `DEV_*_PROVIDER`, `*_BUCKET`, `*_SCANNER_URL` variables. |

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
  - Execute `gcloud storage buckets get-iam-policy gs://$DEV_GCP_PROJECT_ID-document-artifacts` to read back IAM and verify concrete runtime SA ownership.
  - Execute `gcloud run services get-iam-policy drts-dev-scanner` to verify it denies unauthenticated access.
  - Execute `curl -I https://drts-dev-scanner-...` and `curl -I https://storage.googleapis.com/$DEV_GCP_PROJECT_ID-document-artifacts` to assert HTTP 401/403 anonymous denial.
  - Execute `gcloud run services describe drts-dev-scanner --format='value(image)'` to read back exact deployed `gateway` and `clamd` digests, ensuring they match step output.
  - Execute `gcloud run services describe drts-dev-scanner` to assert memory limits (512Mi/4Gi) and concurrency limit (1).

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
