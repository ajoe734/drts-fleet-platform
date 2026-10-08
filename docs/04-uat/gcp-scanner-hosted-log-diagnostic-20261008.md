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
- Fifth repair (SHA `d4640c828d07e359b0b0c87cb7c561e33375c17d`) was REJECTED: whole-stderr substring search interpreted arbitrary token/project digits (e.g. `SYNTHETIC_403_TOKEN`, `synthetic-403123`) as HTTP status codes, missing specific auth/account/SDK category fallbacks, misdirecting diagnosis.
- Sixth repair (SHA `b2622c37e88d91100c9f4c528a1468233f4a3608`): REJECTED. Still leaked `403` status from `synthetic-403-project` project name due to `\b403\b` matching. Failed to parse URL statuses correctly due to `HTTP` keyword. Incorrectly parsed `unrecognized arguments: --account-synthetic` as `AUTH / ACCOUNT_ISSUE`.
- Seventh repair (SHA `ddffcd5adf6f6ee8213d119d01a8a24ffac6db0b`): REJECTED. Introduced regressions A-D by moving substring checks ahead of explicit statuses, causing `synthetic-usage-project` to emit `SDK / ARGUMENT_ISSUE` instead of `404`, and unanchored error headers admitted arbitrary payload substrings which overrode the explicit cause.
- Eighth repair (current): Explicitly anchors error matching to lines starting with `ERROR:` or `EXCEPTION:`, ignoring payload bodies. Checks explicit HTTP statuses first, handling formatting like `HTTPError 403` properly, before checking fallback substring identifiers. This successfully resolved regressions A-D while preserving fixed safe literal output.
## Conclusion
The verifier was proven by minimal replay probes and unit tests to surface actionable non-secret `stderr` diagnostics by emitting fixed, safe category messages. This prevents known arbitrary payload or token leakage (including nested, multiline, non-JSON, and unknown error formats) and avoids misidentifying tokens/project IDs as statuses, while retaining the true nonzero exception and enabling failure diagnosis on future runs.

## Acceptance Evidence Ledger (AI_COLLABORATION_GUIDE §0.7)

### `hosted_log_failure_diagnostic_bounds_redaction_and_restore`
- **Source version:** Differential probe across `ddffcd5adf6f6ee8213d119d01a8a24ffac6db0b` (rejected R7), and current working tree.
- **Actual Command & Exit Code:**
  - `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover tools/ci/` (Exit 0)
  - `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover tests/unit/gcp-scanner-cold-readiness-20261007/` (Exit 0)
  - Success-only full-lifecycle test: `PYTHONDONTWRITEBYTECODE=1 python3 -c "import unittest; from tools.ci.test_verify_dev_artifact_backends import TestVerifyDevArtifactBackends; unittest.main(module='tools.ci.test_verify_dev_artifact_backends', defaultTest='TestVerifyDevArtifactBackends.test_scanner_hosted_full_lifecycle_and_restoration_regression')"` (Exit 0)
  - Actual failure injection probe (both-read restoration): `PYTHONDONTWRITEBYTECODE=1 python3 stdin` using `_make_env_aware_run_side_effect` and `_make_env_aware_urlopen_side_effect` wrapped to inject `CalledProcessError(7)` on read1 and read2, asserting exact-revision query, caught error, final env restored, and no secret leaked. (Exit 0)
- **Before Result:** Minimal replay probe on rejected SHAs confirmed regressions A-D where substring checks incorrectly identified SDK/Auth issues from resource names, and unanchored payload bodies incorrectly triggered explicit status codes.
- **After Result:** `test_run_helper_redaction_and_bound` asserts that simulated errors with tricky tokens (e.g., `synthetic-403123`, `synthetic-usage-project`) and explicit contexts are properly categorized without false positives. Exact diagnostic sizes are tightly bounded by fixed strings. The original exception identity, fields, stdout, and both-read failure restoration evidence successfully PASS. All test suites completed successfully.
- **Hosted Evidence:** Local differential probes and CI unit tests only; no hosted product execution dispatched per scope restrictions.

### `hosted_log_diagnostic_exact_sha_review_ci_merge`
- **Source version:** Candidate working tree awaiting review handoff.
- **Actual Command & Exit Code:** Exact-SHA review pending upstream bus approval.
- **Before Result:** Exact-SHA review REOPENED against `ddffcd5adf6f6ee8213d119d01a8a24ffac6db0b` due to A-D diagnostic correctness regressions.
- **After Result:** Addressed R7 completely by anchoring error header lines, enforcing explicit status checks first, and properly matching HTTP statuses, resolving regressions A-D while maintaining prior fixed behaviors. Added accurate failure injection command records.
- **Hosted Evidence:** Pending upstream CI/merge; no product deployment dispatched locally.
