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
| **R5b.2-transport (Deterministic transport fault)** | `4943a26ee9a40aec7301fe7e76868ed830b62b9d` -> `22ec14ac983f2dc6d36b476ee4662b79ce29360e` -> `0df7d7177a08beca28b4f783b2d37e8fdfb0e689` | **Open (repeated, 2nd consecutive round)** | n/a (static review + independent Node probe) | Codex's REOPEN review of candidate `0df7d7177` (generation `0509ffdaf4b44903b7def5538b822950`, PR #2349) re-confirmed this unchanged from `22ec14ac9`: an independent Node 22.23.2 probe loading each SHA's complete unchanged handler/readiness/transport/protocol modules (sockets/replies modeled, real 1 ms timers) found `CLAMD_TIMEOUT_MS=1` applies the SAME deadline to readiness VERSION and the INSTREAM scan at both SHAs; the Python verifier's `timeout => 502` assumption (`verify-dev-artifact-backends.py` Test 9) is not live transport evidence. The `FAULT_INJECT_TRANSPORT` key reserved in `mutated_keys` remains an unused dead placeholder. Repair boundary per the reopened review: prove readiness succeeds, fail only the INSTREAM exchange via a bounded authorized hosted external fault control, then prove exact clean/EICAR restoration -- without replacing the production exchange with a canned verdict. Reviewer explicitly declined to mandate a production gateway switch and instead directed Supervisor to assess a hosted external control within the EXISTING harness scope first and coordinate any genuinely needed extra paths with Claude2; `operations/artifact-scanner/gateway/**` remains outside this task's `write_scopes`. Not claiming repaired; awaiting Supervisor scope decision before Claude2 implements the control mechanism. |
| **R5b.2-lifecycle (Genuine CVD/CLD lifecycle)**   | `4943a26ee9a40aec7301fe7e76868ed830b62b9d` -> `22ec14ac983f2dc6d36b476ee4662b79ce29360e` -> `0df7d7177a08beca28b4f783b2d37e8fdfb0e689` | **Partially repaired (two defects fixed this round; one gap remains open, repeated 2nd consecutive round)** | `python3 -m py_compile tests/unit/gcp-artifact-activation-20261004/test_genuine_clamd_lifecycle.py` exit 0; `env -u CLAMD_IMAGE PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest tests/unit/gcp-artifact-activation-20261004/test_genuine_clamd_lifecycle.py -v` exit 0, 1 skipped (no hosted `CLAMD_IMAGE`, not engine acceptance); standalone `unittest` probe of the isolated assertion logic (old vs. new baseline) below. | Prior round (0df7d717) added real zINSTREAM framing, on-disk `daily.cvd`/`daily.cld` header/version parsing cross-checked against the readiness marker, deterministic "unchanged" freshclam assertion, `marker_mtime_1`/`marker_mtime_2` checks, and dual marker+version-file removal on failure. Codex's REOPEN review found two residual defects in that work, both now fixed in this round: (1) the post-recovery mtime assertion (line ~299) compared `marker_mtime_2` against `marker_mtime_1` (the initial-startup mtime) instead of `marker_mtime_after_unchanged` (the latest known-good mtime captured immediately before the later refresh-failure injection), so a restored marker that was actually OLDER than the last pre-failure republish -- i.e. recovery never really happened -- could still pass; fixed by comparing against `marker_mtime_after_unchanged`. Minimal reproduction: an isolated `unittest` probe with `marker_mtime_1=100`, `marker_mtime_after_unchanged=200`, `marker_mtime_2=150` shows the old assertion (`assertGreater(150, 100)`) passes (bug: wrongly reports recovery) while the new assertion (`assertGreater(150, 200)`) fails as expected (bug caught) -- run locally, exit 0, both outcomes confirmed. (2) the comment claimed the background watchdog "observes this exact output" from the test's manual `docker exec ... freshclam --stdout` call; read against `clamd-entrypoint.sh`'s actual watchdog loop (a separate, independently-scheduled periodic `freshclam --stdout` on `FRESHCLAM_INTERVAL_SECONDS`), that claim was unsupported -- the manual call's own stdout is never consumed by the entrypoint. Comment corrected to describe the real mechanism; the `time.sleep(7)` wait and downstream assertions were already compatible with the watchdog's own independent pass and did not need to change. **Still open**: a genuinely "controlled" daily version transition (forcing a real, higher-version signed CVD to be loaded, or a failed/pending reload with the old version still loaded followed by activation of a newer one) is not exercised -- `clamd-entrypoint.sh#cvd_version` only trusts a file whose real ClamAV-VDB header parses, and manufacturing one without either a genuine upstream release during the hosted run or ClamAV's private signing material is out of this harness's write scope. Per the reopened review, Claude2/Supervisor must choose a concrete hosted fixture/control strategy (e.g. seeding a genuine older historical CVD before the run so a real upstream mirror pass performs the transition) and scope it; not claiming this sub-item repaired. This file remains unexecuted on this VM (Docker-less) pending the hosted "Verify Genuine Clamd Lifecycle" CI step. |
| **R6 (GCS Generation CAS/Limits)**                | `744bf88193cbf8d2f4a1915763ab3656f9c9e88d` | Repaired             | `python3 operations/verification/verify-dev-artifact-backends.py`   | PENDING. Tests generation CAS using test-owned objects. Test 12 (network fault) is implemented-but-unexecuted live, tested by CI mock. |
| **R5b.4b (Restoration Fidelity / test evidence)** | `4943a26ee9a40aec7301fe7e76868ed830b62b9d` -> `22ec14ac983f2dc6d36b476ee4662b79ce29360e` -> `0df7d7177a08beca28b4f783b2d37e8fdfb0e689` | **Repaired, confirmed FIXED on REOPEN re-review** | `python3 -B -m unittest tools.ci.test_verify_dev_artifact_backends` | Codex's REOPEN review of `0df7d7177` (PR #2349) independently re-probed this with its own Python 3.12.3 doubles against the complete unchanged old/new tests: old test PASS while swallowing `Expected 503, got 200` (never reaching Test9); current test PASS, Test9 reached, no premature exception; new env-aware success and restoration-denial cases pass; additional probes calling the actual verification helper (modeling only subprocess/time/HTTP boundaries) confirmed exact gateway+clamd restoration (including timeout and unrelated keys) and exact exception propagation after a `CLAMD_TIMEOUT_MS=1` enable. No reopening needed for this finding. PASS, exit 0, 10 tests (was 9; +1 new). Original repair: Codex's 2026-10-05/06 review found `test_scanner_hosted_restoration_regression` mocked an unconditional 200 for every scan, so the real helper's Test5 assertion (`Expected 503, got 200`, verify-dev-artifact-backends.py:152) failed immediately and was swallowed by a bare `assertRaises(Exception)`; the `finally` block's removal of an originally-absent `CLAMD_TIMEOUT_MS` then satisfied the old assertion even though the fault was never actually enabled. Reproduced this exact failure locally against the unmodified test before changing it (`Hosted scenario failed: Expected 503, got 200`). Replaced it with `test_scanner_hosted_full_lifecycle_and_restoration_regression` (an env-aware gcloud/urlopen double that derives each scan response from the *actual* mutated container env state, so Test5/6's readiness rejections, the cold-start pending->ready transition, and Test9's transport fault are each genuinely conditioned on state the helper itself wrote; asserts the `CLAMD_TIMEOUT_MS=1` enable call was reached, and that every mutated key is restored via `--remove-env-vars` -- the "originally absent" path the broken test never reached) plus `test_scanner_hosted_restoration_denial_regression` (injects a `CalledProcessError` on the full-key restore call and asserts the helper raises "Failed to restore scanner config" rather than reporting success). |
| **R8-doc (UAT Schemas/Readback)**                 | `15ee4f06653386adcc80ada1e7b616926409860c` -> `0df7d7177a08beca28b4f783b2d37e8fdfb0e689` | **Open (repeated, 2nd consecutive round)** | n/a (static review) | Codex's REOPEN review of `0df7d7177` re-confirmed this unchanged: `docs/04-uat/gcp-artifact-activation-20261004.md` still requires a helper explicitly pending creation plus placeholder driver/ops JWTs; `bootstrap-auth.guard.ts:388` -> `jwt-auth.service.ts:935` verify signed tokens/session claims and durable state, and `deploy-dev.yml:2025-2065` issues tenant sessions only, so gate 4 lacks executable authorized session/fixture preparation, not merely an unexecuted runtime check. The code needed (signed JWT issuance plus driver/ops/reimbursement-batch/public-info-version fixtures through formal contracts/repositories) remains outside this task's current `write_scopes`. Per the review's repair boundary this needs Supervisor to coordinate the helper's scope/ownership -- never fabricate tokens or weaken auth -- before Claude2 implements it. Not claiming repaired; the "pending creation" language from the prior round is preserved below, not weakened. |
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
