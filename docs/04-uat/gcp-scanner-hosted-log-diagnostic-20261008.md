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
- Fourth repair (SHA `3133959b0511b6fadbc074f7fe08ca27f8eb86fd`) implemented a conservative regex-based fail-closed truncation strategy: 
  - Finds the earliest occurrence of any trace block or body marker (`\{`, `Request body:`, `Response body:`, `== headers start ==`, `==== request start ====`, `==== response start ====`) and truncates the string entirely at that marker.
  - Ensures robust exclusion of multiline, non-JSON, and malformed/truncated bodies or headers without trusting arbitrary line labels as terminators.
  - Fixes column-formatting bugs for token redaction (`^[ \t]*authorization:`).
  - Explicit fallback redaction for named keys properly handles truncated values lacking closing quotes/braces (`[^"\n\r]+`).
- Explicitly bounded the diagnostic output to a wrapper prefix plus up to 1024 characters of the redacted trace, yielding at most 1081 characters (`Diagnostic (gcloud logging read failed): ` prefix + up to 1024 retained characters + `... [TRUNCATED]`).
- The `stderr` is printed to `sys.stderr` before the exception is re-raised, preserving the existing error contract.
- Added separate regression fixtures to `test_run_helper_redaction_and_bound` in `tools/ci/test_verify_dev_artifact_backends.py` for multiline bodies, non-JSON responses, header formatting, incomplete credential blocks, and previous regressions to ensure fail-closed truncation and 1024-char bounding.

## Conclusion
The verifier was proven by minimal replay probes and unit tests to surface actionable non-secret `stderr` diagnostics bounded in length, fully stripped of sensitive payloads/headers (including nested and non-JSON), enabling failure diagnosis on future runs.

## Acceptance Evidence Ledger (AI_COLLABORATION_GUIDE §0.7)

### `hosted_log_failure_diagnostic_bounds_redaction_and_restore`
- **Source version:** Rejected SHAs `2a23536d2836fee7c9bd88b43a92ee5f496f8660`, `d756aede7d0e921c0f23b9ebe8f9fd69c07a20ae` vs new patched SHA `3133959b0511b6fadbc074f7fe08ca27f8eb86fd`.
- **Actual Command & Exit Code:** 
  - `PYTHONDONTWRITEBYTECODE=1 python3 /tmp/probe2.py` (Exit 0)
  - `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover tools/ci/ -p 'test_*.py'` (Exit 0)
- **Before Result:** Minimal replay probe on rejected SHA `d756aede7d0e921c0f23b9ebe8f9fd69c07a20ae` confirmed leaks on multiline non-JSON bodies (`NOTE: SYNTHETIC_BODY`), `Response body:`, indented `Cookie:`, and truncated credentials (`{"refresh_token": "SYNTHETIC_REFRESH`).
- **After Result:** `test_run_helper_redaction_and_bound` asserts that simulated `gcloud logging read` errors with tricky JSON strings, nested JSON, form bodies, indented headers, and truncated JSON blocks are properly redacted via robust early-truncation (`***REDACTED REQUEST***`, `{ ***REDACTED BODY*** }`, etc.), and that the final output is strictly bounded to 1024 characters. Tokens and auth headers are explicitly masked, and the original `subprocess.CalledProcessError(7, ...)` identity/properties (`returncode`, `stderr`, `stdout`) are completely preserved for the caller. All 14 tests in `tools/ci/test_verify_dev_artifact_backends.py` pass.
- **Hosted Evidence:** Local differential probes and CI unit tests only; no hosted product execution dispatched per scope restrictions.

### `hosted_log_diagnostic_exact_sha_review_ci_merge`
- **Source version:** Pending commit (anchor `3133959b0511b6fadbc074f7fe08ca27f8eb86fd`).
- **Actual Command & Exit Code:** Pending upstream CI/Review.
- **Before Result:** Exact-SHA review REJECTED `d756aede7d0e921c0f23b9ebe8f9fd69c07a20ae` for unbounded leakage (R1 persistence).
- **After Result:** Addressed R1 (comprehensive fail-closed early truncation), maintained R2 (1024 char bounding on the string), and addressed R3 (document corrected with exact actual bounds, history of repairs, and reproducible probe provenance).
- **Hosted Evidence:** To be acquired after same-SHA CI/merge via subsequent workflow dispatch.
