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

| Finding / Gate                                    | Original Finding SHA                       | New Candidate Result | Command / Assertion                                                 | Result / Artifacts / Unexecuted                                                                                                        |
| ------------------------------------------------- | ------------------------------------------ | -------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **R5a (MIME/Hash/Size Rejection)**                | `744bf88193cbf8d2f4a1915763ab3656f9c9e88d` | Repaired             | `python3 -B -m unittest tools.ci.test_verify_dev_artifact_backends` | PASS (exit 0). Includes modeled tests for rejection and mock assertions.                                                               |
| **R5b.3 (Engine-limit contract)**                 | `744bf88193cbf8d2f4a1915763ab3656f9c9e88d` | Repaired             | `python3 -B -m unittest tools.ci.test_verify_dev_artifact_backends` | PASS (exit 0). Asserts `502 scan_engine_indeterminate` for limit-exhausted scans.                                                      |
| **R5b.2 (Genuine Transitions)**                   | `15ee4f06653386adcc80ada1e7b616926409860c` | Repaired             | `python3 operations/verification/verify-dev-artifact-backends.py`   | PENDING. All required lifecycle transitions and network timeout scenarios are implemented for genuine live execution.                  |
| **R6 (GCS Generation CAS/Limits)**                | `744bf88193cbf8d2f4a1915763ab3656f9c9e88d` | Repaired             | `python3 operations/verification/verify-dev-artifact-backends.py`   | PENDING. Tests generation CAS using test-owned objects. Test 12 (network fault) is implemented-but-unexecuted live, tested by CI mock. |
| **R5b.4b (Restoration Fidelity)**                 | `ff8285a0da5405357af9a8d8a0d66a7234f1f7b1` | Repaired             | `python3 operations/verification/verify-dev-artifact-backends.py`   | PENDING. Captures exact mutated gateway env vars and completely restores them, followed by readiness/EICAR asserts.                    |
| **R8-doc (UAT Schemas/Readback)**                 | `15ee4f06653386adcc80ada1e7b616926409860c` | Repaired             | Manual readback/documentation                                       | PENDING. Executable authorized hosted fixture/session recipe requires Supervisor-coordinated helper for signed JWTs and complete JSON fixture records. |
| **R9 (Commit Trailers/Whitespaces)**              | `ff8285a0da5405357af9a8d8a0d66a7234f1f7b1` | Repaired             | `python3 -B tools/ci/git/check_commit_trailers.py`                  | PASS (offline branch checks). Whitespaces and trailers fixed.                                                                          |
| **1. immutable_hosted_workflow_review_ci**        | `744bf88193cbf8d2f4a1915763ab3656f9c9e88d` | Pending CI           | Git / CI Checks                                                     | Workflow ensures `source_ref` immutable validation and mock tests are part of CI. Final CI pass pending on PR.                         |
| **2. private_resources_iam_and_image_provenance** | `744bf88193cbf8d2f4a1915763ab3656f9c9e88d` | Pending Hosted       | Hosted runbacks                                                     | Exact assertions prepared for bucket IAM/versioning, service policy, anonymous denial, container digests, min0/max1.                   |
| **3. genuine_scan_storage_positive_negative**     | `744bf88193cbf8d2f4a1915763ab3656f9c9e88d` | Pending Hosted       | Hosted verification run                                             | Workflow automatically runs `verify-dev-artifact-backends.py` in live GCP environment to confirm storage controls and engine recovery. |
| **4. shared_dev_provider_activation_readback**    | `744bf88193cbf8d2f4a1915763ab3656f9c9e88d` | Pending Deployment   | Live deployment                                                     | Coordinated immutable deployment configuring 6 provider variables, followed by runtime readback.                                       |

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
    - Get discovered URL: `export SCANNER_URL=$(gcloud run services describe drts-dev-scanner --region=$DEV_GCP_REGION --project=$DEV_GCP_PROJECT_ID --format='value(status.url)')`.
    - Execute `gcloud run services get-iam-policy drts-dev-scanner --region=$DEV_GCP_REGION --project=$DEV_GCP_PROJECT_ID --format=json` and verify the bindings contain `roles/run.invoker` exclusively mapped to the authorized service account(s), with no `allUsers` binding.
    - Execute `curl -I $SCANNER_URL/health`, `curl -I https://storage.googleapis.com/$DEV_GCP_PROJECT_ID-document-artifacts`, and `curl -I https://storage.googleapis.com/$DEV_GCP_PROJECT_ID-remittance-proofs` to assert HTTP 401/403 anonymous denial.
    - Confirm the effective invoker IAM check succeeds by using the reviewed first-hop auth@v2 scanner audience token rail in CI (passing the `id_token` output to curl), not a local gcloud credential.
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
  - Assert explicit runtime source SHA and selected deployed env/config by checking the deployment workflow logs and the Cloud Run environment variables (`gcloud run services describe`), NOT via the product `/health` endpoint which intentionally does not expose backend artifact configuration.
  - Execute a coordinated, authenticated runtime readback using real product app-session procedures via the `deploy-dev.yml` registered token issuance rails:
    - **Fixture Preparation & Session Issuance:**
      - Generate a driver session and test fixtures using a **Supervisor-coordinated helper tool** (pending creation).
      - *Note: Raw database inserts cannot produce the cryptographically signed JWTs required by `bootstrap-auth.guard.ts`. The missing helper must correctly issue signed JWTs for driver (`driver:write`) and ops (`billing:write`, `foundation:write`) identities. It must also insert complete, properly shaped JSON records for driver profiles, reimbursement batches, and public info versions (which are required by repository hydration).*
      - Once the helper is available, use it to export:
        ```bash
        DRIVER_TOKEN="<signed-jwt-for-driver>"
        OPS_TOKEN="<signed-jwt-for-ops>"
        ```

    - **Remittance Proofs (Driver & Ops):**
      - As the explicitly seeded driver identity (`realm=driver`), execute `POST /api/reimbursements/proofs/staged-content` containing actual test-owned fixture bytes (`contentBase64`, `contentType`) and the required header `Idempotency-Key: <stage-uuid>` to receive a `stagedContentRef`.
      - Execute `POST /api/reimbursements/proofs` with an `UploadRemittanceProofCommand` payload (including `batchId`, `originalFilename`, `contentType`, `sizeBytes`, and the `stagedContentRef`) and required header `Idempotency-Key: <upload-uuid>` to persist and scan the bytes.
      - For system/ops readback of the scanned proof, execute `POST /api/reimbursements/proofs/:proofId/readback` (as the platform ops admin with `billing:write`) to obtain an API envelope containing `data.readbackUrl`.
      - Use the issued `readbackUrl` (which already includes the signed URL manifest parameters for `GET /api/reimbursements/proof-downloads/remittance-proof/:proofId`) to download the stored proof. Assert the retrieved bytes, hash, and length exactly match the test fixture.
      - Execute the same staging/scanning procedure as the driver using a known EICAR fixture. Assert that the endpoint persists a `scanState: "rejected"` with `rejectionReason: "MALWARE_DETECTED"`, and that controlled-download via readback is denied for the infected content.
    - **Document Artifacts (Producer & Ops):**
      - As the authorized platform identity (platform ops admin with `foundation:write`), execute `POST /api/platform-admin/placards` with a `GeneratePlacardVersionCommand` payload containing test fixture parameters (`versionCode`, `publicInfoVersionId`, `templateName`). This natively delegates to the document artifact store.
      - The endpoint will return an API envelope containing the published placard metadata, which should include `artifactDownloadUrl` and `downloadMetadata.downloadUrl`.
      - Execute the document readback via `GET /api/downloads/placard/:placardVersionId?...` (resolving the exact query parameters provided in `downloadMetadata.downloadUrl`) to obtain the controlled-download.
      - Assert the retrieved bytes, hash, and length exactly match the test fixture.

  - Check the backend logs to confirm the Cloud Run gateway processed the file scan (`verdict: clean` and `verdict: infected`) and GCS successfully stored/rejected them under the expected IDs/generations. Download the files directly using `gcloud storage cat` with the runtime identity to independently confirm storage bytes.
