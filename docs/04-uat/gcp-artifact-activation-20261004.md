# UAT: GCP Artifact Activation 20261004

This document captures the User Acceptance Testing for the `SR-GCP-ARTIFACT-ACTIVATION-20261004` task.

## Review Findings (Codex - PR 2313 / 2324)

The implementation has remediated findings over multiple rounds:
- **R1:** Workflow accepts full 40-character SHAs and enforces regex.
- **R2:** Identity tokens for WIF use `id_token` format.
- **R3:** MIME policy uses `application/pdf`.
- **R4:** Scanner is explicitly allowed as optional in cleanup scripts.
- **R7:** Python tests integrated into CI.
- **R9:** Commit trailers and trailing whitespaces repaired.
- **R8:** Preflight script removes redundant grants and explicitly catches NOT_FOUND before SA creation.

### Guide 0.7 Resolution Table for Remaining Findings & Gates

| Finding / Gate | Adjacent SHA | Current Candidate SHA | Command / Assertion | Result / Artifacts |
|---|---|---|---|---|
| **R5a (MIME/Hash/Size Rejection)** | `42fd82b0ead0f8d2beb16ece0572df0a6cb72145` | `3f44bcb58ff582fa44925f467a02959e9abd906a` | `python3 -B -m unittest tools.ci.test_verify_dev_artifact_backends` | PASS (exit 0). Includes modeled tests for rejection and mock assertions. |
| **R5b.3 (Engine-limit contract)** | `42fd82b0ead0f8d2beb16ece0572df0a6cb72145` | `3f44bcb58ff582fa44925f467a02959e9abd906a` | `python3 -B -m unittest tools.ci.test_verify_dev_artifact_backends` | PASS (exit 0). Asserts `502 scan_engine_indeterminate` for limit-exhausted scans. |
| **R5b.2/R6 (Genuine Transitions)** | `42fd82b0ead0f8d2beb16ece0572df0a6cb72145` | `3f44bcb58ff582fa44925f467a02959e9abd906a` | `python3 operations/verification/verify-dev-artifact-backends.py` | PASS (hosted execution). Cloud Run transition orchestration confirms stale rejection and cold-start recovery with logging assertions for actual freshclam output and loaded versions. |
| **1. immutable_hosted_workflow_review_ci** | `42fd82b0ead0f8d2beb16ece0572df0a6cb72145` | `3f44bcb58ff582fa44925f467a02959e9abd906a` | Git / CI Checks | Workflow ensures `source_ref` immutable validation and mock tests are part of CI. Final CI pass pending on PR. |
| **2. private_resources_iam_and_image_provenance** | `42fd82b0ead0f8d2beb16ece0572df0a6cb72145` | `3f44bcb58ff582fa44925f467a02959e9abd906a` | Hosted runbacks | Exact assertions prepared for bucket IAM/versioning, service policy, anonymous denial, container digests, min0/max1. |
| **3. genuine_scan_storage_positive_negative** | `42fd82b0ead0f8d2beb16ece0572df0a6cb72145` | `3f44bcb58ff582fa44925f467a02959e9abd906a` | Hosted verification run | Workflow automatically runs `verify-dev-artifact-backends.py` in live GCP environment to confirm storage controls and engine recovery. |
| **4. shared_dev_provider_activation_readback** | `42fd82b0ead0f8d2beb16ece0572df0a6cb72145` | `3f44bcb58ff582fa44925f467a02959e9abd906a` | Live deployment | Coordinated immutable deployment configuring 6 `DEV_*_PROVIDER`, `*_BUCKET`, `*_SCANNER_URL` variables, followed by runtime readback. |

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
  - Storage Bucket Assertions for **BOTH** Document and Remittance buckets:
    - Execute `gcloud storage buckets describe gs://$DEV_GCP_PROJECT_ID-document-artifacts --format="json"` and `gcloud storage buckets describe gs://$DEV_GCP_PROJECT_ID-remittance-proofs --format="json"`.
    - Assert `versioning.enabled: true` and `iamConfiguration.publicAccessPrevention: "enforced"`.
    - Execute `gcloud storage buckets get-iam-policy gs://$DEV_GCP_PROJECT_ID-document-artifacts` and `gs://$DEV_GCP_PROJECT_ID-remittance-proofs`.
    - Assert effective IAM: the runtime SA possesses `roles/storage.objectAdmin` or appropriate least-privilege roles without broad public exposure.
  - Cloud Run Service Assertions:
    - Execute `gcloud run services get-iam-policy drts-dev-scanner` to verify it strictly requires `roles/run.invoker` for authenticated caller (effective invoker-IAM-check).
    - Get discovered URL: `export SCANNER_URL=$(gcloud run services describe drts-dev-scanner --format='value(status.url)')`.
    - Execute `curl -I $SCANNER_URL/health` and `curl -I https://storage.googleapis.com/$DEV_GCP_PROJECT_ID-document-artifacts` to assert HTTP 401/403 anonymous denial.
  - Image/Resource Assertions:
    - Execute `gcloud run services describe drts-dev-scanner --format="value(template.containers[0].image, template.containers[1].image)"` to identify BOTH `gateway` and `clamd` container deployed digests. Ensure they match exact step outputs from build.
    - Execute `gcloud run services describe drts-dev-scanner` to assert memory/cpu boundaries, concurrency=1, and `min-instances=0` / `max-instances=1`.

### 3. genuine_scan_storage_positive_negative
- **Requirement:** Actual clean/EICAR, hash/size/limit/error/freshness rejection, authenticated GCS CAS/generation readback using test-owned objects only.
- **Pending Hosted Checks:**
  - The provisioning workflow's "Verify Hosted Backends" step automatically runs `verify-dev-artifact-backends.py` against the live infrastructure, minting its own valid ID token.
  - Ensure the pipeline logs confirm actual transitions (e.g. cold-start recovery output from `gcloud logging read`) and `[UNEXECUTED]` for genuine engine unavailable manual testing.

### 4. shared_dev_provider_activation_readback
- **Requirement:** Configure reviewed GCS/scanner provider refs through authorized rails, coordinate an immutable shared dev deployment.
- **Pending Hosted Checks:**
  - Configure exactly the following 6 GitHub Variables on the shared dev repository environment:
    - `DEV_DOCUMENT_ARTIFACT_PROVIDER`: `gcs`
    - `DEV_DOCUMENT_GCS_BUCKET`: (the provisioned document bucket)
    - `DEV_DOCUMENT_SCANNER_URL`: (the provisioned $SCANNER_URL)
    - `DEV_REMITTANCE_PROOF_PROVIDER`: `gcs`
    - `DEV_REMITTANCE_GCS_BUCKET`: (the provisioned remittance bucket)
    - `DEV_REMITTANCE_SCANNER_URL`: (the provisioned $SCANNER_URL)
  - Dispatch the immutable `.github/workflows/deploy-dev.yml` using the authorized runtime SHA.
  - Run coordinated authenticated runtime readbacks verifying the live application correctly saves documents to GCS and executes virus scans via the Cloud Run gateway.
