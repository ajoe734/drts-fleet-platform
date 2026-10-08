# GCP Scanner Hosted Log Diagnostic 20261008

## Context
During the operator-authorized immutable hosted run `37718086150` using source `da6347c0ce5630c8700e5d6ae54f75c003e07f6d`, the `Verify Hosted Backends` step failed at the exact-revision `gcloud logging read`. Since `subprocess.run` did not surface `stderr` on `CalledProcessError`, the exact failure reason was masked. The restoration step did run and restored the service.

## Findings
- Evidence found in `/home/lupin/workspace/drts-fleet-platform/.local/full-system-completion-20261008/oversize-hosted-retest/`.
- The exact matching "Fetching ClamAV signatures" log exists.
- The IAM snapshot lacks `roles/logging.viewer` or equivalent for `github-actions-deployer`. This is an observation and hypothesis for the failure cause, not a proven fact since the real stderr was withheld.
- The withheld `stderr` could not be verified without modifying the caller because it was never printed. 

## Bounded Repair
- Initial repair attempt (SHA `e520f52d0fff2c058259238b4788da4e384b2a17`) failed to redact bounded diagnostic information.
- Second repair attempt (SHA `2a23536d2836fee7c9bd88b43a92ee5f496f8660`) was REJECTED: non-greedy JSON regex `\{.*?\}` leaked content inside strings (e.g., `{"password":"prefix}SYNTHETIC_PASSWORD"}`), nested JSON bodies, and non-JSON bodies (`Request body: api_key=...`).
- Third repair attempt (SHA `d756aede7d0e921c0f23b9ebe8f9fd69c07a20ae`) was REJECTED: while it fixed nested JSON using greedy `\{.*\}`, it trusted arbitrary alphabetic line labels as body terminators (leaking multiline non-JSON bodies like `NOTE: SYNTHETIC_BODY`), failed to match `Response body:`, required column-zero formatting for `Cookie`/`Authorization`, and failed to redact truncated JSON payloads missing closing quotes/braces.
- Fourth repair (SHA `3133959b0511b6fadbc074f7fe08ca27f8eb86fd` / `0bc0cb399710afaeaaea826757243c617cb723a1`) implemented a conservative regex-based fail-closed truncation strategy. While it fixed most markers, it was REJECTED: unmatched arbitrary stderr formats (e.g. literal body markers missing newlines, folded continuation headers, YAML/plain colon-delimited credentials) still passed through unchanged and leaked synthetic credentials.
- Fifth repair (current) abandons enumerating secret-key regexes and markers entirely. It extracts a conservative set of diagnostic categories (e.g., `PERMISSION_DENIED`, `UNAUTHENTICATED`, `NOT_FOUND`, `DEADLINE_EXCEEDED`) and emits a fixed safe message for known classes, suppressing all arbitrary content/unknown formats with a fixed fallback message (`[redacted: UNKNOWN_ERROR_FORMAT]`).
- The `stderr` is printed to `sys.stderr` before the exception is re-raised, preserving the existing error contract and bounds.
- Added separate regression fixtures to `test_run_helper_redaction_and_bound` in `tools/ci/test_verify_dev_artifact_backends.py` proving no synthetic string ever leaks on unmatched payloads or edge-case trace lines.

## Conclusion
The verifier was proven by minimal replay probes and unit tests to surface actionable non-secret `stderr` diagnostics by emitting fixed, safe category messages. This completely prevents arbitrary payload or token leakage (including nested, multiline, non-JSON, and unknown error formats) while retaining the true nonzero exception and enabling failure diagnosis on future runs.

## Acceptance Evidence Ledger (AI_COLLABORATION_GUIDE §0.7)

### `hosted_log_failure_diagnostic_bounds_redaction_and_restore`
- **Source version:** Rejected SHAs `0bc0cb399710afaeaaea826757243c617cb723a1` vs new patched SHA (current).
- **Actual Command & Exit Code:** 
  - `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest tools/ci/test_verify_dev_artifact_backends.py` (Exit 0)
- **Before Result:** Minimal replay probe on rejected SHA `0bc0cb399710afaeaaea826757243c617cb723a1` confirmed leaks on folded header continuations, literal missing-newline body markers, YAML/plain credentials, and non-JSON xml responses.
- **After Result:** `test_run_helper_redaction_and_bound` asserts that simulated `gcloud logging read` errors with tricky JSON strings, folded headers, YAML credentials, and unknown XML formats are properly categorized or safely fallback to `[redacted: UNKNOWN_ERROR_FORMAT]`. All synthetic values are successfully suppressed, preserving the exception contract (`returncode`, `stderr`, `stdout`). All tests in `tools/ci/test_verify_dev_artifact_backends.py` pass.
- **Hosted Evidence:** Local differential probes and CI unit tests only; no hosted product execution dispatched per scope restrictions.

### `hosted_log_diagnostic_exact_sha_review_ci_merge`
- **Source version:** Pending commit (current).
- **Actual Command & Exit Code:** Pending upstream CI/Review.
- **Before Result:** Exact-SHA review REJECTED `0bc0cb399710afaeaaea826757243c617cb723a1` for unmatched arbitrary stderr format leakage (R1 persistence).
- **After Result:** Addressed R1 completely (by switching from regex masking to safe fixed categories and fallback), maintained R2 (bounds intrinsically enforced by short fixed messages), and addressed R3 (document corrected with exact actual bounds, history of repairs).
- **Hosted Evidence:** To be acquired after same-SHA CI/merge via subsequent workflow dispatch.
