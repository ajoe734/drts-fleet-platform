# GCP Scanner Hosted Log Diagnostic 20261008

## Context
During the operator-authorized immutable hosted run `37718086150` using source `da6347c0ce5630c8700e5d6ae54f75c003e07f6d`, the `Verify Hosted Backends` step failed at the exact-revision `gcloud logging read`. Since `subprocess.run` did not surface `stderr` on `CalledProcessError`, the exact failure reason was masked. The restoration step did run and restored the service.

## Findings
- Evidence found in `/home/lupin/workspace/drts-fleet-platform/.local/full-system-completion-20261008/oversize-hosted-retest/`.
- The exact matching "Fetching ClamAV signatures" log exists.
- The IAM snapshot lacks `roles/logging.viewer` or equivalent for `github-actions-deployer`. This is an observation and hypothesis for the failure cause, not a proven fact since the real stderr was withheld.
- The withheld `stderr` could not be verified without modifying the caller because it was never printed. 

## Bounded Repair
- Initial repair attempt (SHA `2a23536d2836fee7c9bd88b43a92ee5f496f8660`) was REJECTED: non-greedy JSON regex `\{.*?\}` leaked content inside strings (e.g., `{"password":"prefix}SYNTHETIC_PASSWORD"}`), nested JSON bodies, and non-JSON bodies (`Request body: api_key=...`).
- Second repair implemented conservative regex-based masking: 
  - Greedy JSON redaction (`\{.*\}`) properly bounds nested JSON and string-embedded braces without leaking.
  - Explicit redaction of everything following `Request body:` and `Response body:` up to the next log block, catching non-JSON bodies.
  - Explicit multiline header redaction and safe extraction of truncated traces.
- Explicitly bounded the diagnostic output to 1024 characters to prevent arbitrary unbounded logging of multiline payloads.
- The `stderr` is printed to `sys.stderr` before the exception is re-raised, preserving the existing error contract.
- Added separate regression fixtures to `test_run_helper_redaction_and_bound` in `tools/ci/test_verify_dev_artifact_backends.py` for tricky string braces, nested JSON, and non-JSON bodies to ensure masking, bounding, and error contract preservation.

## Conclusion
The verifier was proven by minimal replay probes and unit tests to surface actionable non-secret `stderr` diagnostics bounded in length, fully stripped of sensitive payloads/headers (including nested and non-JSON), enabling failure diagnosis on future runs.

## Acceptance Evidence Ledger (AI_COLLABORATION_GUIDE §0.7)

### `hosted_log_failure_diagnostic_bounds_redaction_and_restore`
- **Source version:** Original rejected SHA `2a23536d2836fee7c9bd88b43a92ee5f496f8660` vs new patched version (pending commit).
- **Actual Command & Exit Code:** 
  - `PYTHONDONTWRITEBYTECODE=1 python3 /tmp/probe2.py` (Exit 0)
  - `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover tools/ci/ -p 'test_*.py'` (Exit 0)
- **Before Result:** Minimal replay probe on rejected SHA `2a23536d2836fee7c9bd88b43a92ee5f496f8660` confirmed leaks on `{"password":"prefix}SYNTHETIC_PASSWORD"}` (emitted `}SYNTHETIC_PASSWORD"}`), nested JSON (`{"metadata":{},...}` emitted remaining body), and form bodies (`api_key=...`).
- **After Result:** `test_run_helper_redaction_and_bound` and standalone probe assert that simulated `gcloud logging read` errors with tricky JSON strings, nested JSON, and form bodies are properly redacted (`***REDACTED BODY***`), truncated trace headers are stripped, and output is strictly bounded to 1024 characters. Tokens and auth headers are explicitly masked, and the original `subprocess.CalledProcessError(7, ...)` identity/properties (`returncode`, `stderr`, `stdout`) are completely preserved for the caller. All 14 tests in `tools/ci/test_verify_dev_artifact_backends.py` pass.
- **Hosted Evidence:** Local differential probes and CI unit tests only; no hosted product execution dispatched per scope restrictions.

### `hosted_log_diagnostic_exact_sha_review_ci_merge`
- **Source version:** Pending commit.
- **Actual Command & Exit Code:** Pending upstream CI/Review.
- **Before Result:** Exact-SHA review REJECTED `2a23536d2836fee7c9bd88b43a92ee5f496f8660` for unbounded leakage (R1 persistence).
- **After Result:** Addressed R1 (comprehensive greedy JSON redaction & non-JSON body exclusion), maintained R2 (1024 char bounding), and R3 (doc correction and regression evidence ledger).
- **Hosted Evidence:** To be acquired after same-SHA CI/merge via subsequent workflow dispatch.
