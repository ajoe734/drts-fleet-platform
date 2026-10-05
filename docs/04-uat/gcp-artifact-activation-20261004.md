# UAT: GCP Artifact Activation 20261004

This document captures the User Acceptance Testing for the `SR-GCP-ARTIFACT-ACTIVATION-20261004` task.

## Review Findings (Codex - PR 2313 / 2324)

The implementation has remediated findings over multiple rounds:
- **R1:** Workflow accepts full 40-character SHAs and enforces regex.
- **R2:** Identity tokens for WIF use `id_token` format.
- **R3:** MIME policy uses `application/pdf`.
- **R4:** Scanner is explicitly allowed as optional in cleanup scripts.
- **R7:** Python tests integrated into CI.
- **R9:** Commit trailers repaired.
- **R8:** Preflight script removes redundant grants and explicitly catches NOT_FOUND before SA creation.

### Guide 0.7 Resolution Table for Remaining Findings & Gates

| Finding / Gate | Original Finding SHA | New Candidate Result | Command / Assertion | Result / Artifacts / Unexecuted |
|---|---|---|---|---|
| **R5a (MIME/Hash/Size Rejection)** | `744bf88193cbf8d2f4a1915763ab3656f9c9e88d` | Repaired | `python3 -B -m unittest tools.ci.test_verify_dev_artifact_backends` | PASS (exit 0). Includes modeled tests for rejection and mock assertions. |
| **R5b.3 (Engine-limit contract)** | `744bf88193cbf8d2f4a1915763ab3656f9c9e88d` | Repaired | `python3 -B -m unittest tools.ci.test_verify_dev_artifact_backends` | PASS (exit 0). Asserts `502 scan_engine_indeterminate` for limit-exhausted scans. |
| **R5b.2 (Genuine Transitions)** | `744bf88193cbf8d2f4a1915763ab3656f9c9e88d` | Pending Hosted | `python3 operations/verification/verify-dev-artifact-backends.py` | PENDING. Hosted scenarios for verified-unchanged, update, failed refresh/reload, pending/failed -> activated, transport failure, and genuine cold-start recovery. |
| **R6 (GCS Generation CAS/Limits)** | `744bf88193cbf8d2f4a1915763ab3656f9c9e88d` | Repaired | `python3 operations/verification/verify-dev-artifact-backends.py` | PENDING. Tests generation CAS using test-owned objects. |
| **R5b.4b (Restoration Fidelity)** | `ff8285a0da5405357af9a8d8a0d66a7234f1f7b1` | Repaired | `python3 operations/verification/verify-dev-artifact-backends.py` | PENDING (unexecuted live). Captures exact mutated gateway env vars and completely restores them, followed by readiness/EICAR asserts. |
| **R8-doc (UAT Schemas/Readback)** | `ff8285a0da5405357af9a8d8a0d66a7234f1f7b1` | Repaired | Manual readback/documentation | PASS. Doc schemas and readback commands updated. |
| **R9 (Commit Trailers/Whitespaces)** | `ff8285a0da5405357af9a8d8a0d66a7234f1f7b1` | Repaired | `python3 -B tools/ci/git/check_commit_trailers.py` | PASS (offline branch checks). Whitespaces and trailers fixed. |
| **1. immutable_hosted_workflow_review_ci** | `744bf88193cbf8d2f4a1915763ab3656f9c9e88d` | Pending CI | Git / CI Checks | Workflow ensures `source_ref` immutable validation and mock tests are part of CI. Final CI pass pending on PR. |
| **2. private_resources_iam_and_image_provenance** | `744bf88193cbf8d2f4a1915763ab3656f9c9e88d` | Pending Hosted | Hosted runbacks | Exact assertions prepared for bucket IAM/versioning, service policy, anonymous denial, container digests, min0/max1. |
| **3. genuine_scan_storage_positive_negative** | `744bf88193cbf8d2f4a1915763ab3656f9c9e88d` | Pending Hosted | Hosted verification run | Workflow automatically runs `verify-dev-artifact-backends.py` in live GCP environment to confirm storage controls and engine recovery. |
| **4. shared_dev_provider_activation_readback** | `744bf88193cbf8d2f4a1915763ab3656f9c9e88d` | Pending Deployment | Live deployment | Coordinated immutable deployment configuring 6 provider variables, followed by runtime readback. |

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
    - Execute `gcloud storage buckets describe gs://$DEV_GCP_PROJECT_ID-document-artifacts --format="json" --raw` and `gcloud storage buckets describe gs://$DEV_GCP_PROJECT_ID-remittance-proofs --format="json" --raw`.
    - Assert ownership/location (e.g. `location` matches `$DEV_GCP_REGION` and `projectNumber` belongs to `$DEV_GCP_PROJECT_ID`), `versioning.enabled: true`, `iamConfiguration.publicAccessPrevention: "enforced"`, and `iamConfiguration.uniformBucketLevelAccess.enabled: true`.
    - Execute `gcloud storage buckets get-iam-policy gs://$DEV_GCP_PROJECT_ID-document-artifacts` and `gs://$DEV_GCP_PROJECT_ID-remittance-proofs`.
    - Assert effective IAM: the runtime SA possesses `roles/storage.objectAdmin` or appropriate least-privilege roles without broad public exposure.
  - Cloud Run Service Assertions:
    - Execute `gcloud run services get-iam-policy drts-dev-scanner --region=$DEV_GCP_REGION --project=$DEV_GCP_PROJECT_ID --format=json` and verify the bindings contain `roles/run.invoker` exclusively mapped to the authorized service account(s), with no `allUsers` binding. Then use `curl -H "Authorization: Bearer $(gcloud auth print-identity-token)" $SCANNER_URL/health` to confirm the authorized identity succeeds.
    - Get discovered URL: `export SCANNER_URL=$(gcloud run services describe drts-dev-scanner --region=$DEV_GCP_REGION --project=$DEV_GCP_PROJECT_ID --format='value(status.url)')`.
    - Execute `curl -I $SCANNER_URL/health`, `curl -I https://storage.googleapis.com/$DEV_GCP_PROJECT_ID-document-artifacts`, and `curl -I https://storage.googleapis.com/$DEV_GCP_PROJECT_ID-remittance-proofs` to assert HTTP 401/403 anonymous denial.
  - Image/Resource Assertions:
    - Execute `gcloud run services describe drts-dev-scanner --region=$DEV_GCP_REGION --project=$DEV_GCP_PROJECT_ID --format="value(spec.template.spec.containers[0].image, spec.template.spec.containers[1].image)"` to identify BOTH `gateway` and `clamd` container deployed digests. Ensure they match exact step outputs from build.
    - Execute `gcloud run services describe drts-dev-scanner --region=$DEV_GCP_REGION --project=$DEV_GCP_PROJECT_ID` to assert memory/cpu boundaries, concurrency=1, and `min-instances=0` / `max-instances=1`.

### 3. genuine_scan_storage_positive_negative
- **Requirement:** Actual clean/EICAR, hash/size/limit/error/freshness rejection, authenticated GCS CAS/generation readback using test-owned objects only.
- **Pending Hosted Checks:**
  - The provisioning workflow's "Verify Hosted Backends" step automatically runs `verify-dev-artifact-backends.py` against the live infrastructure, minting its own valid ID token.
  - Ensure the pipeline logs confirm actual transitions: verified-unchanged/update/failed refresh/reload, pending/failed -> activated, transport failure after successful readiness, and genuine cold-start recovery with real scan receipts for both clean and EICAR files.

### 4. shared_dev_provider_activation_readback
- **Requirement:** Configure reviewed GCS/scanner provider refs through authorized rails, coordinate an immutable shared dev deployment only after gate3 passes.
- **Pending Hosted Checks:**
  - Configure exactly the following 6 GitHub Variables on the shared dev repository environment:
    - `DEV_DOCUMENT_ARTIFACT_STORAGE_PROVIDER`: `gcs`
    - `DEV_DOCUMENT_ARTIFACT_GCS_BUCKET`: `<document bucket>`
    - `DEV_REMITTANCE_PROOF_STORAGE_PROVIDER`: `gcs`
    - `DEV_REMITTANCE_PROOF_GCS_BUCKET`: `<proof bucket>`
    - `DEV_REMITTANCE_PROOF_SCANNER_PROVIDER`: `cloud-run-clamd`
    - `DEV_REMITTANCE_PROOF_SCANNER_URL`: `<private scanner origin>`
  - Dispatch the immutable `.github/workflows/deploy-dev.yml` using the authorized runtime SHA.
  - Run coordinated authenticated runtime readbacks using ID tokens to call the protected product API to upload a document and a proof, checking runtime SHA/config from the API health endpoints.
  - Execute `curl -H "Authorization: Bearer $(gcloud auth print-identity-token)" ...` against the internal endpoints to verify the uploaded files.
  - Verify the backend logs confirm both the Cloud Run gateway processed the files and GCS successfully stored them. Download the files using `gcloud storage cat` with the runtime identity to confirm the file bytes exactly match the uploaded content.
