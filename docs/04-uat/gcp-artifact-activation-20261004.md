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
| **R5b.2-transport (Deterministic transport fault)** | `4943a26ee9a40aec7301fe7e76868ed830b62b9d` -> `22ec14ac983f2dc6d36b476ee4662b79ce29360e` | **Open** | n/a (static review) | Codex's round of 2026-10-05/06 confirmed `CLAMD_TIMEOUT_MS` is a single deadline shared by readiness VERSION and scan INSTREAM in `operations/artifact-scanner/gateway/clamd-transport.ts`, so a 1 ms value does not deterministically fail INSTREAM only after readiness succeeds. A real fix needs a dedicated fault-injection boundary in the gateway (the `FAULT_INJECT_TRANSPORT` key already reserved in `verify-dev-artifact-backends.py`'s `mutated_keys` is unused dead placeholder today). `operations/artifact-scanner/gateway/**` is **not** in this task's `write_scopes`; per the review's own repair boundary this needs Supervisor to expand write_scopes before Claude2 can implement it. Not claiming repaired. |
| **R5b.2-lifecycle (Genuine CVD/CLD lifecycle)**   | `4943a26ee9a40aec7301fe7e76868ed830b62b9d` -> `22ec14ac983f2dc6d36b476ee4662b79ce29360e` | **Partially repaired** | `python3 -m py_compile tests/unit/gcp-artifact-activation-20261004/test_genuine_clamd_lifecycle.py`; self-skips locally (`CLAMD_IMAGE` unset, exit 0, 1 skipped) since this VM runs no Docker/real engine. | Rewrote `tests/unit/gcp-artifact-activation-20261004/test_genuine_clamd_lifecycle.py`: (a) real zINSTREAM framing (length-prefixed chunks + zero terminator, matching `clamd-protocol.ts#encodeInstream` byte-for-byte) replacing the bare `zINSTREAM\0` probe, asserting the actual `stream: OK` / `stream: ... FOUND` reply text instead of `nc`'s exit code; (b) independent on-disk `daily.cvd`/`daily.cld` header/version parsing (mirrors `clamd-entrypoint.sh#cvd_version`) and coexistence tie-break (mirrors `daily_reference_file`), cross-checked against the readiness marker; (c) the "unchanged" freshclam event is now deterministically triggered (manual `freshclam --stdout` exec) and hard-asserted against the exact file/version-bound regex `clamd-entrypoint.sh#daily_check_verified` requires, instead of a passive `print("Warning: ...")` on timeout; (d) `marker_mtime_1`/`marker_mtime_2` are now asserted (file mtime unchanged + marker mtime advances on "unchanged"; marker mtime strictly advances past pre-failure value on recovery); (e) the failed-refresh path now also asserts the version file (not just the marker) is removed. **Not fully repaired**: a genuinely "controlled" daily version bump (forcing a new, real, higher-version signed CVD) is not fabricated -- ClamAV's engine verifies CVD signatures at load and this harness holds neither the private signing key nor `operations/artifact-scanner/**` write scope to add an unsigned-`.cld`-injection path; this sub-item remains dependent on either a real upstream release during the hosted run window or a Supervisor-scoped change to the entrypoint/gateway. This file is unexecuted on this VM (Docker-less); correctness verified by code review and `py_compile` only, pending the actual hosted "Verify Genuine Clamd Lifecycle" CI step. |
| **R6 (GCS Generation CAS/Limits)**                | `744bf88193cbf8d2f4a1915763ab3656f9c9e88d` | Repaired             | `python3 operations/verification/verify-dev-artifact-backends.py`   | PENDING. Tests generation CAS using test-owned objects. Test 12 (network fault) is implemented-but-unexecuted live, tested by CI mock. |
| **R5b.4b (Restoration Fidelity / test evidence)** | `4943a26ee9a40aec7301fe7e76868ed830b62b9d` -> `22ec14ac983f2dc6d36b476ee4662b79ce29360e` | **Repaired** | `python3 -B -m unittest tools.ci.test_verify_dev_artifact_backends` | PASS, exit 0, 10 tests (was 9; +1 new). Codex's 2026-10-05/06 review found `test_scanner_hosted_restoration_regression` mocked an unconditional 200 for every scan, so the real helper's Test5 assertion (`Expected 503, got 200`, verify-dev-artifact-backends.py:152) failed immediately and was swallowed by a bare `assertRaises(Exception)`; the `finally` block's removal of an originally-absent `CLAMD_TIMEOUT_MS` then satisfied the old assertion even though the fault was never actually enabled. Reproduced this exact failure locally against the unmodified test before changing it (`Hosted scenario failed: Expected 503, got 200`). Replaced it with `test_scanner_hosted_full_lifecycle_and_restoration_regression` (an env-aware gcloud/urlopen double that derives each scan response from the *actual* mutated container env state, so Test5/6's readiness rejections, the cold-start pending->ready transition, and Test9's transport fault are each genuinely conditioned on state the helper itself wrote; asserts the `CLAMD_TIMEOUT_MS=1` enable call was reached, and that every mutated key is restored via `--remove-env-vars` -- the "originally absent" path the broken test never reached) plus `test_scanner_hosted_restoration_denial_regression` (injects a `CalledProcessError` on the full-key restore call and asserts the helper raises "Failed to restore scanner config" rather than reporting success). |
| **R8-doc (UAT Schemas/Readback)**                 | `15ee4f06653386adcc80ada1e7b616926409860c` | **Open** | n/a (static review) | `bootstrap-auth.guard.ts`/`jwt-auth.service.ts` require signed, durable sessions; `deploy-dev.yml` issues tenant sessions only, with no equivalent for driver/ops identities. No executable fixture/session-issuance helper exists yet, and the code needed to add one (signed JWT issuance plus driver/ops/reimbursement-batch/public-info-version fixtures through formal repositories) is outside this task's current `write_scopes`. Per the review's repair boundary this needs Supervisor to coordinate the helper's scope/ownership before Claude2 implements it. Not claiming repaired; the "pending creation" language from the prior round is preserved below, not weakened. |
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
