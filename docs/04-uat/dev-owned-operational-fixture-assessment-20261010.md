# Dev Owned Operational Fixture Assessment (2026-10-10)

## Overview

This UAT document tracks the execution and verification of the genuine guarded hosted read-only assessment for original owned operational fixtures, as specified in `SR-DEV-OWNED-OPERATIONAL-FIXTURE-ASSESSMENT-20261010`.

This assessment does **not** perform any mutation or cleanup. It is strictly a read-only assessment that validates the existence and integrity of specific GCS objects and Postgres database rows, outputting `"assessment_only": true` and `"cleanup_not_performed": true` in all reports.

**Status**: NOT EXECUTED in live environment. All evidence is source/synthetic execution based on the candidate worktree. No actual cloud/DB read was performed by this UAT.

## Evidence Source Identity
- **Task ID**: SR-DEV-OWNED-OPERATIONAL-FIXTURE-ASSESSMENT-20261010
- **Candidate SHA**: (To be captured at handoff - latest is the commit following 4e3d4b84da8f9990d69d7b37175d39d4d941cdb5)
- **Reviewer**: Codex
- **Workspace**: Isolated review worktree (`cwd: /home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-sr-dev-owned-operational-fixture-assessment-20261010`)
- **Python Version**: 3.12.3

## Detailed Finding Execution Logs

Command run for tests: `python3 -m unittest tests/unit/gcp-artifact-activation-20261004/test_owned_operational_fixture_assessment.py -v` (Exit Code 0).
Command for type/checks: `env -u COMMIT_TRAILER_BYPASS python3 -B tools/ci/git/check_commit_trailers.py --base 8ec22133a28f2fa19974ae0c0a3b3127cc5aa747 --head HEAD`

### Matrix of repairs and unverified claims

| Finding | Source / Action Taken | Status |
|---------|-----------------------|--------|
| **F1 Authentic Authority** | Workflow path explicitly checked against original `deploy-dev.yml`. Exact 9 jobs verified in `assess-owned-operational-fixtures.py` loop. Artifact download now bounds streamed size to 5850 bytes using `subprocess.Popen` without buffering. Real tests use saved genuine API responses without mutating test policy. | PARTIAL (Mock tested, real API NOT EXECUTED) |
| **F2 Hosted Rails** | Variables dynamically verified against expected literals before GCP auth. Enforced max age < 3600s on observed metadata. Validated `current_runtime_sha`. Authenticated current run_id against `dev` branch and `workflow_dispatch` event in script. Schema and Operator environment boundaries implemented. | PARTIAL (Workflow config updated, real runtime NOT EXECUTED) |
| **F3 Native Bounds** | Used `os.read(fileno, 4096)` to perform fully non-blocking unbounded reads across both stdout and stderr with 30s timeout and finite output limits. Fixes blocking buffering from `p.stdout.read(4096)` which stalled the script. | PARTIAL (Unit tests pass, GCS NOT EXECUTED) |
| **F4/F5 Formal DB** | Corrected table names to actual `phase1_registry_*` migrations for relationships. Adjusted expected status constraints to true DB `draft`/`submitted`/etc. Added explicit missing count checks that do not zero-coalesce. Added broad `pres_*` counts covering whole tables instead of just fixture target items. | PARTIAL (Mock transport passes, live DB snapshot NOT EXECUTED) |
| **F6/F7 Evidence** | Removed `tearDown` and test mutations of `AUTHORIZED_PROVENANCE`. Kept UAT keys NOT MET until genuine Operator/DB execution evidence exists. | PARTIAL (Unit tests skipped honestly, UAT updated) |
| **F8 Publication** | Retained clean v2/PR2542 match. Restored explicit exact own-task prefix `SR-DEV-OWNED-OPERATIONAL-FIXTURE-ASSESSMENT-20261010:` instead of `fix(...)`. | PARTIAL (Pending normal close of old PR preserving history) |

## Execution Bounds and Reporting

The workflow correctly restricts secrets, body, and non-fixture rows. It produces a bounded hosted JSON report which is uploaded as a durable artifact. The report now includes `cloud_metadata` verifying the reservation and environment runtime.
Real ownership (GCS and DB) is clearly differentiated from synthetic disposition.
The CLI `main()` executes zero real transport when invoked with `--mock-db`. Error responses are strictly sanitized. Broad preservation counts exist for tracking.

## Acceptance Criteria Verified

1. **`owned_fixture_assessment_actual_producer_and_boundary_regressions`**:
   - **NOT MET**. Formal PG limits disclosed; no runtime waiver. Genuine boundary tests run successfully with exact PDF bytes in unit tests, but real actual producer runs are not validated locally.

2. **`owned_fixture_assessment_exact_sha_review_ci_protected_merge`**:
   - **NOT MET**. To be verified by CI and GitHub PR status once submitted.

3. **`owned_fixture_assessment_genuine_reserved_hosted_native_objects_db_snapshot`**:
   - **NOT EXECUTED / NOT MET**. Genuine reserved immutable Operator/native/formal-submission snapshot not executed in the live environment. Script boundaries defined but execution deferred.
