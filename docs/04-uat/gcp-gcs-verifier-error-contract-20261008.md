# GCS Verifier Error Contract - 2026-10-08

## Context and Failure
In hosted run [37734571232](https://github.com/ajoe734/drts-fleet-platform/actions/runs/37734571232) using source `5f57e39bd2eb00ebdffba0a966ed772629a468d0` and definition `3ecd55d6cf18ec4bdc2d3c28c527d2b3d7555f1f`, Test 11 correctly rejected uploading to an absent path with an existing nonzero generation. However, `test_gcs` asserted the wrong CLI text shape and aborted, leaving Test 12 unexecuted.

**Command:**
`gcloud --impersonate-service-account=drts-dev-runtime@drts-dev-devcc-20260825.iam.gserviceaccount.com storage cp <run-owned-temp> gs://drts-dev-devcc-20260825-document-artifacts/verify-test-1791439032-188305df.txt-absent --if-generation-match=1791439036671118`

**Actual Error:**
`ERROR: Task 'gs://drts-dev-devcc-20260825-document-artifacts/verify-test-1791439032-188305df.txt-absent' failed: GcsPreconditionFailedError('')`

The previous implementation accepted `"Precondition Failed"` or `"PRECONDITION"` accompanied by `"412"`, but GCS typed errors might just surface as `GcsPreconditionFailedError('')` which failed the classifier. Furthermore, the old classifier incorrectly flagged any output containing `412` or similar strings even within paths or payloads.

## Bounded Repair
We introduced a strict `is_gcs_precondition_failed(e)` helper to classify genuine external GCS precondition failures from CLI output:
- Analyzes only lines strictly beginning with `ERROR:` or `EXCEPTION:`.
- Strips any quoted values and `gs://...` paths prior to matching to eliminate false positives on filenames or payloads.
- Recognizes explicit typed SDK error: `GcsPreconditionFailedError`.
- Recognizes explicit HTTP status and message matching: `412` with `Precondition Failed`.

Test 12 was also modified. Previously it passed `--access-token-file=/dev/null` which is blocked at the SDK preflight boundary, and `test_gcs_success` only exercised a canned HTTP 401. It now uses a bounded unauthenticated HTTP request via `urllib.request` with an explicit timeout to genuinely verify external `401`/`403` denial without hanging indefinitely, and accurately propagates transport/timeout issues.

## Finding and Acceptance Ledger

- **Exact Source Hashes**:
  - Base: `5f57e39bd2eb00ebdffba0a966ed772629a468d0` (Old)
  - Candidate: Current HEAD exact branch (`gemini2/sr-gcp-gcs-verifier-error-contract-20261008`)

- **Reproducible Old/New Results**:
  - `old5f57e` helper probes (`test_gcs_precondition_failed_classifier`): Fails to match `GcsPreconditionFailedError('')` and falsely triggers on `"ERROR: (gcloud.storage.cp) HTTPError 403: Forbidden for gs://bucket/object-412"`.
  - Repaired classifier tests correctly pass all true cases (including the hosted failure) and reject all unrelated errors and injected path patterns.

- **SDK Assessment Evidence & Mock Limitations**:
  - Because `gcloud storage` abstracts multiple backend implementations and Google SDKs (which may differ by version and environment), reproducing exact network bounds requires raw HTTP checks.
  - Test 12 was previously mocked entirely under `subprocess.run` assuming the SDK would behave uniformly.
  - The new test directly targets HTTP boundaries utilizing `test_gcs_http_boundaries` mock setup to ensure we test exactly 401/403 vs 404/5xx and timeout behaviors securely.

- **Failure Exception / Cleanup Checks**:
  - A stalled endpoint without `timeout=10.0` previously caused infinite hangs, skipping the `finally` exact generation cleanup block.
  - Timeouts and non-401/403 HTTP codes now correctly propagate exceptions, ensuring `Test 12b` is skipped and `finally` runs to clean up `test_file#gen1` and `test_file#gen2`. Tests verify `AssertionError` and `URLError` properly surface.

- **Affected-Suite Results**:
  - All 17 `tools.ci.test_verify_dev_artifact_backends` checks successfully PASS.

- **Status**:
  - Hosted denial: **PENDING**
  - CI/merge: **PENDING**
