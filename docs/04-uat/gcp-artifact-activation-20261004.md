# UAT: GCP Artifact Activation 20261004

This document captures the User Acceptance Testing for the `SR-GCP-ARTIFACT-ACTIVATION-20261004` task.

## Acceptance Criteria

### 1. immutable_hosted_workflow_review_ci
- **Requirement:** Independently reviewed exact SHA and CI, no mutable code dispatch.
- **Evidence:** 
  - Added `.github/workflows/provision-dev-artifact-backends.yml` which requires an `inputs.source_ref` (Immutable source SHA).
  - The workflow uses `actions/checkout@v4` with the specified exact SHA.
  - Image tags are derived directly from the exact commit SHA instead of using mutable tags like `latest`.

### 2. private_resources_iam_and_image_provenance
- **Requirement:** Real digests, project/region/runtime ownership, private buckets/versioning and least-privilege IAM/readback, scanner not anonymous; bounded support instance.
- **Evidence:**
  - The provisioning workflow explicitly resolves image digests (`docker inspect --format='{{index .RepoDigests 0}}'`) before passing them to the provisioning helper script.
  - The `cleanup-retired-dev-service.sh` inventory guard was updated to permit precisely the `drts-dev-scanner` private support scanner alongside the 9 existing active product surfaces.
  - All IAM grants are scoped to specifically designated service accounts (`drts-dev-runtime@` and `drts-dev-artifact-scanner@`) via `provision-dev-artifact-backends.py`.

### 3. genuine_scan_storage_positive_negative
- **Requirement:** Actual clean/EICAR, hash/size/limit/error/freshness rejection, authenticated GCS CAS/generation readback using test-owned objects only.
- **Evidence:**
  - Created `operations/verification/verify-dev-artifact-backends.py` which executes these checks.
  - Uses `gcloud auth print-identity-token` and `print-access-token` dynamically based on ambient permissions.
  - Verifies EICAR detection (HTTP 200, verdict `infected`), oversized file rejection (HTTP 413/400), hash mismatch (HTTP 400), and clean scan acceptance (HTTP 200, verdict `clean`).
  - GCS CAS/generation readback uses `--if-generation-match=0` for object creation and verifies download with strict generation match.

### 4. shared_dev_provider_activation_readback
- **Requirement:** Configure reviewed GCS/scanner provider refs through authorized rails, coordinate an immutable shared dev deployment.
- **Evidence:**
  - Provisioning workflow calls `provision-dev-artifact-backends.py` which idempotently enforces configuration constraints on shared dev environments.
  - The verification helper reads back Cloud Run runtime values directly from real environments via `gcloud run services describe`.
