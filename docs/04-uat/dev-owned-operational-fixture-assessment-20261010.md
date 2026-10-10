# Dev Owned Operational Fixture Assessment (2026-10-10)

## Overview

This UAT document tracks the execution and verification of the genuine guarded hosted read-only assessment for original owned operational fixtures, as specified in `SR-DEV-OWNED-OPERATIONAL-FIXTURE-ASSESSMENT-20261010`.

This assessment does **not** perform any mutation or cleanup. It is strictly a read-only assessment that validates the existence and integrity of specific GCS objects and Postgres database rows, outputting `"assessment_only": true` and `"cleanup_not_performed": true` in all reports.

**Status**: NOT EXECUTED in live environment. All evidence is source/synthetic execution based on the candidate worktree. No actual cloud/DB read was performed by this UAT.

## Evidence Source Identity
- **Task ID**: SR-DEV-OWNED-OPERATIONAL-FIXTURE-ASSESSMENT-20261010
- **Candidate SHA**: (To be captured at handoff)
- **Reviewer**: Codex
- **Workspace**: Isolated review worktree (`cwd: /home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-sr-dev-owned-operational-fixture-assessment-20261010`)
- **Python Version**: 3.12.3

## Detailed Finding Execution Logs

Command run for tests: `python3 -m unittest tests/unit/gcp-artifact-activation-20261004/test_owned_operational_fixture_assessment.py -v` (Exit Code 0).
Command for type/checks: `env -u COMMIT_TRAILER_BYPASS python3 -B tools/ci/git/check_commit_trailers.py --base 8ec22133a28f2fa19974ae0c0a3b3127cc5aa747 --head HEAD`

### Matrix of repairs and unverified claims

| Finding | Source / Action Taken | Status |
|---------|-----------------------|--------|
| **F1 Authentic Authority** | Workflow path checked against `deploy-dev.yml` and workflow_id verified. Exact 9 jobs verified for ID and chronological order. Artifact download uses strictly bounded `subprocess.run` with 30s timeout. Real tests use saved genuine API responses with transport-only mocks. | PARTIAL (Mock tested, real API NOT EXECUTED) |
| **F2 Hosted Rails** | Validated exact 9 services in metadata. Enforced `drts-dev-scanner` exact spec SHA and `drts-dev-api` provider settings. Verified that private consoles lack `allUsers` bindings. Authenticated current run_id against `dev` branch, `workflow_dispatch` event, and correct assessment workflow definition. | PARTIAL (Unit tests pass, real runtime NOT EXECUTED) |
| **F3 Native Bounds** | Used `os.read(fileno, 4096)` to perform fully non-blocking unbounded reads across both stdout and stderr with 30s timeout and finite output limits. Fixes blocking buffering from `p.stdout.read(4096)` which stalled the script. | PARTIAL (Unit tests pass, GCS NOT EXECUTED) |
| **F4/F5 Formal DB** | Added accurate relational traversals from `fleet.supply_submissions` to Phase 1 tables using actual `canonical_*_id` FK columns. Captured exact retention blockers for draft structures. Computed `pres_*` counts as an inventory combining row count and text digest hashes. Enforced correct result types. | PARTIAL (Mock transport passes, live DB snapshot NOT EXECUTED) |
| **F6/F7 Evidence** | Provenance tests unskipped and configured to use genuine saved fixture ZIP (`artifact-11606165993.zip`) with transport mocks if available, proving no trust mutation is needed. Kept UAT keys NOT MET until genuine Operator/DB execution evidence exists. | PARTIAL (Genuine local mock execution, true positive limits explicitly declared) |
| **F8 Publication** | Retained clean v2/PR2542 match. Resolved functional findings in SAME task context; pending Supervisor prospective publication disposition for resolving the prior non-compliant `4e3d` ancestor. | PARTIAL (Pending Supervisor disposition) |

## Execution Bounds and Reporting

The workflow correctly restricts secrets, body, and non-fixture rows. It produces a bounded hosted JSON report which is uploaded as a durable artifact. The report now includes `cloud_metadata` verifying the exact full current environment (9 expected services, scanner properties, API providers, missing public bindings on private consoles) before proceeding.
Real ownership (GCS and DB) is clearly differentiated from synthetic disposition.
The CLI `main()` executes zero real transport when invoked with `--mock-db`. Error responses are strictly sanitized. Broad preservation digests exist for tracking actual unchanged state.

## Acceptance Criteria Verified

1. **`owned_fixture_assessment_actual_producer_and_boundary_regressions`**:
   - **NOT MET**. Formal PG limits disclosed; no runtime waiver. Genuine boundary tests run successfully with exact PDF bytes in unit tests against local mock fixtures, but real actual producer runs are not validated locally.

2. **`owned_fixture_assessment_exact_sha_review_ci_protected_merge`**:
   - **NOT MET**. To be verified by CI and GitHub PR status once submitted.

3. **`owned_fixture_assessment_genuine_reserved_hosted_native_objects_db_snapshot`**:
   - **NOT EXECUTED / NOT MET**. Genuine reserved immutable Operator/native/formal-submission snapshot not executed in the live environment. Script boundaries defined but execution deferred.
