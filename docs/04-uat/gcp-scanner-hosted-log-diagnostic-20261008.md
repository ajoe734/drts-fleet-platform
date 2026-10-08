# GCP Scanner Hosted Log Diagnostic 20261008

## Context
During the operator-authorized immutable hosted run `37718086150` using source `da6347c0ce5630c8700e5d6ae54f75c003e07f6d`, the `Verify Hosted Backends` step failed at the exact-revision `gcloud logging read`. Since `subprocess.run` did not surface `stderr` on `CalledProcessError`, the exact failure reason was masked. The restoration step did run and restored the service.

## Findings
- Evidence found in `/home/lupin/workspace/drts-fleet-platform/.local/full-system-completion-20261008/oversize-hosted-retest/`.
- The exact matching "Fetching ClamAV signatures" log exists.
- The IAM snapshot lacks `roles/logging.viewer` or equivalent for `github-actions-deployer`. This indicates an observed permission gap preventing the verifier from reading the Cloud Run logs.
- The withheld `stderr` could not be verified without modifying the caller because it was never printed. 

## Bounded Repair
- Modified `operations/verification/verify-dev-artifact-backends.py::run` to catch `subprocess.CalledProcessError` on `gcloud logging read` calls.
- Applied regex-based masking for potential secrets (`ya29.*`, `ey.*`, `bearer *`, `authorization: *`) to ensure bounded secret-safe output.
- The `stderr` is now printed to `sys.stderr` before the exception is re-raised, preserving the existing error contract and the ability to execute the `finally` restoration block.
- Added a regression test `test_scanner_hosted_log_diagnostic_redaction` to `tools/ci/test_verify_dev_artifact_backends.py` to ensure the masking and surfacing works properly without weakening acceptance or bypassing IAM checks.

## Conclusion
The verifier now surfaces the actionable non-secret `stderr` diagnostic, which will confirm the IAM permission denial when retried, retaining fail-closed acceptance without granting IAM or modifying the product release.
