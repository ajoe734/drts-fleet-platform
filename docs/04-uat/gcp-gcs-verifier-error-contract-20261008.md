# GCS Verifier Error Contract - 2026-10-08

## Context and Failure
In hosted run [37734571232](https://github.com/ajoe734/drts-fleet-platform/actions/runs/37734571232) using source `5f57e39bd2eb00ebdffba0a966ed772629a468d0` and definition `3ecd55d6cf18ec4bdc2d3c28c527d2b3d7555f1f`, Test 11 correctly rejected uploading to an absent path with an existing nonzero generation. However, `test_gcs` asserted the wrong CLI text shape and aborted, leaving Test 12 unexecuted.

**Command:**
`gcloud --impersonate-service-account=drts-dev-runtime@drts-dev-devcc-20260825.iam.gserviceaccount.com storage cp <run-owned-temp> gs://drts-dev-devcc-20260825-document-artifacts/verify-test-1791439032-188305df.txt-absent --if-generation-match=1791439036671118`

**Actual Error:**
`ERROR: Task 'gs://drts-dev-devcc-20260825-document-artifacts/verify-test-1791439032-188305df.txt-absent' failed: GcsPreconditionFailedError('')`

The previous implementation asserted `"Precondition"` or `"412"` in standard error, but GCS typed errors might just surface as `GcsPreconditionFailedError('')`. 

## Bounded Repair
We introduced a strict `is_gcs_precondition_failed(e)` helper to classify genuine external GCS precondition failures from CLI output.
- Recognizes explicit typed SDK error: `GcsPreconditionFailedError`.
- Recognizes explicit HTTP status and message matching: `412` with `Precondition Failed`.
- Rejects incidental `412` matching (e.g. incidental generation IDs or secret token fragments).
- Rejects permission, auth, missing resource, and other SDK errors.

Test 12 was also modified. Previously it passed `--access-token-file=/dev/null` which is blocked at the SDK preflight boundary, so it did not genuinely verify an external permission denial from GCS. It now makes a bounded unauthenticated HTTP request via `urllib.request` to genuinely verify external `401`/`403` denial.

## Verification
Actual-helper regressions were added to `tools/ci/test_verify_dev_artifact_backends.py`:
- `old5f57` fails the observed typed-error case (it would not identify `GcsPreconditionFailedError('')` correctly due to missing "412").
- Repaired source passes observed typed-error case.
- Legitimate `HTTP 412` and class forms remain positives.
- Auth `401`/`403`, missing resources, arbitrary secret-shaped inputs, incidental `412` in names/generations, and other SDK errors remain negatives.
- Failure still propagates and the exact run-owned generations cleanup on failure is preserved.

All 15 CI tests, including the new actual-helper regressions, pass successfully.
