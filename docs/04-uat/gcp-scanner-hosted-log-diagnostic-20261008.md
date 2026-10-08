# GCP Scanner Hosted Log Diagnostic 20261008

## Context
During the operator-authorized immutable hosted run `37718086150` using source `da6347c0ce5630c8700e5d6ae54f75c003e07f6d`, the `Verify Hosted Backends` step failed at the exact-revision `gcloud logging read`. Since `subprocess.run` did not surface `stderr` on `CalledProcessError`, the exact failure reason was masked. The restoration step did run and restored the service.

## Findings
- Evidence found in `/home/lupin/workspace/drts-fleet-platform/.local/full-system-completion-20261008/oversize-hosted-retest/`.
- The exact matching "Fetching ClamAV signatures" log exists.
- The IAM snapshot lacks `roles/logging.viewer` or equivalent for `github-actions-deployer`. This is an observation and hypothesis for the failure cause, not a proven fact since the real stderr was withheld.
- The withheld `stderr` could not be verified without modifying the caller because it was never printed. 

## Bounded Repair
- Modified `operations/verification/verify-dev-artifact-backends.py::run` to catch `subprocess.CalledProcessError` on `gcloud logging read` calls.
- Applied conservative regex-based masking for potential secrets, stripping JSON blocks completely, removing HTTP trace block markers, and explicitly redacting tokens (`ya29.*`, `ey.*`, `bearer *`, `authorization: *`) to ensure bounded secret-safe output.
- Explicitly bounded the diagnostic output to 1024 characters to prevent arbitrary unbounded logging of multiline payloads.
- The `stderr` is now printed to `sys.stderr` before the exception is re-raised, preserving the existing error contract and the ability to execute the `finally` restoration block.
- Added regression test `test_run_helper_redaction_and_bound` to `tools/ci/test_verify_dev_artifact_backends.py` to ensure masking, bounding, and error contract preservation.

## Conclusion
The verifier now surfaces actionable non-secret `stderr` diagnostics bounded in length and stripped of sensitive payloads/headers, enabling failure diagnosis on future runs without dispatching verification under this task.

## Acceptance Evidence Ledger (AI_COLLABORATION_GUIDE §0.7)

### `hosted_log_failure_diagnostic_bounds_redaction_and_restore`
- **Source version:** Original rejected SHA `e520f52d0fff2c058259238b4788da4e384b2a17` vs new patched version (pending commit).
- **Actual Command & Exit Code:** `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover tools/ci -p "test_verify_dev_artifact_backends.py"` (Exit 0)
- **Before Result:** R1/R2 probes showed `run` emitted arbitrary unbounded stderr, including full credential JSON bodies (`refresh_token`, `client_secret`, `private_key` PEM text, password/secret payloads) and unmodified HTTP headers/Bearer tokens. Output size grew linearly with input (1048576 X's produced 1048618 chars).
- **After Result:** `test_run_helper_redaction_and_bound` asserts that simulated `gcloud logging read` errors with 1 MiB payloads and secret JSON/headers are strictly bounded to 1024 characters (plus prefix/suffix), all JSON bodies are scrubbed `"{ ***REDACTED BODY*** }"`, tokens and auth headers are explicitly masked, and the original `subprocess.CalledProcessError(7, ...)` identity/properties (`returncode`, `stderr`, `stdout`) are completely preserved for the caller. Local test passed (14 tests in 1.388s).
- **Hosted Evidence:** Local differential probes only; no hosted product execution dispatched per scope restrictions.

### `hosted_log_diagnostic_exact_sha_review_ci_merge`
- **Source version:** Pending commit.
- **Actual Command & Exit Code:** Pending upstream CI/Review.
- **Before Result:** Exact-SHA review REJECTED `e520f52d0fff2c058259238b4788da4e384b2a17` for unbounded leakage (R1-R3).
- **After Result:** Addressed R1 (comprehensive redaction & JSON exclusion), R2 (1024 char bounding), and R3 (doc correction and evidence ledger).
- **Hosted Evidence:** To be acquired after CI/merge via subsequent workflow dispatch.
