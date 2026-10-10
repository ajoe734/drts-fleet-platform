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

### Matrix of repairs and unverified claims

| Finding | Source / Action Taken | Status |
|---------|-----------------------|--------|
| **F1 Authentic Authority** | Added strict checks for `run_id`, `run_attempt`, window bounds, exact 1 `job`, and job/artifact timeline linkage. Tests restored `AUTHORIZED_PROVENANCE` to prevent mutation. | PARTIAL (Mock tested, real API NOT EXECUTED) |
| **F2 Hosted Rails** | Added `concurrency: group: deploy-dev` to workflow. Added `--cloud-metadata` arg and `read-dev-cloud-metadata.py` binding into the assessment report. | PARTIAL (Workflow config updated, real runtime NOT EXECUTED) |
| **F3 Native Bounds** | Replaced `communicate()` with bounded streaming `read(4096)` and strict 10MiB enforcement limit. Handled `error` vs `not_found` explicitly, rejecting malformed status. | PARTIAL (Unit tests pass, GCS NOT EXECUTED) |
| **F4/F5 Formal DB** | Added full relationship query covering `professional_drivers`, `registered_vehicles`, `vehicle_insurance_policies`, `vehicle_operating_contracts`. Added status string literal checks, exact unique submission set checks. | PARTIAL (Mock transport passes, live DB snapshot NOT EXECUTED) |
| **F6/F7 Evidence** | Corrected UAT claims to be truthful. Added `tearDown` in tests to prevent `AUTHORIZED_PROVENANCE` digest mutation. Verified `NOT EXECUTED` statements remain. | PARTIAL (Unit tests verified, UAT updated) |
| **F8 Publication** | Retained clean v2/PR2542 match and prefix. | PARTIAL (Pending normal close of old PR preserving history) |

## Execution Bounds and Reporting

The workflow correctly restricts secrets, body, and non-fixture rows. It produces a bounded hosted JSON report which is uploaded as a durable artifact. The report now includes `cloud_metadata` verifying the reservation and environment runtime.
Real ownership (GCS and DB) is clearly differentiated from synthetic disposition.
The CLI `main()` executes zero real transport when invoked with `--mock-db`. Error responses are strictly sanitized.

## Acceptance Criteria Verified

1. **`owned_fixture_assessment_actual_producer_and_boundary_regressions`**:
   - **NOT MET**. Formal PG limits disclosed; no runtime waiver. Genuine boundary tests run successfully with exact PDF bytes in unit tests, but real actual producer runs are not validated locally.

2. **`owned_fixture_assessment_exact_sha_review_ci_protected_merge`**:
   - **NOT MET**. To be verified by CI and GitHub PR status once submitted.

3. **`owned_fixture_assessment_genuine_reserved_hosted_native_objects_db_snapshot`**:
   - **NOT EXECUTED / NOT MET**. Genuine reserved immutable Operator/native/formal-submission snapshot not executed in the live environment. Script boundaries defined but execution deferred.
