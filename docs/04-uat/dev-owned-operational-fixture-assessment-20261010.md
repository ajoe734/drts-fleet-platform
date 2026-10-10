# Dev Owned Operational Fixture Assessment (2026-10-10)

## Overview

This UAT document tracks the execution and verification of the genuine guarded hosted read-only assessment for original owned operational fixtures, as specified in `SR-DEV-OWNED-OPERATIONAL-FIXTURE-ASSESSMENT-20261010`.

This assessment does **not** perform any mutation or cleanup. It is strictly a read-only assessment that validates the existence and integrity of specific GCS objects and Postgres database rows, outputting `"assessment_only": true` and `"cleanup_not_performed": true` in all reports.

## Acceptance Criteria Verified

1. **`owned_fixture_assessment_actual_producer_and_boundary_regressions`**:
   - The script `assess-owned-operational-fixtures.py` checks exactly 8 native GCS objects and 4 database submissions using bounded generation-bound requests and read-only repeatable-read DB transactions.
   - External boundaries are cleanly mocked in `test_assess_owned_operational_fixtures.py` (GCS `describe`/`cat` and PostgreSQL query simulation).
   - Zero local runtime/external mutation calls exist.
   - All tests run cleanly.

2. **`owned_fixture_assessment_exact_sha_review_ci_protected_merge`**:
   - (To be verified externally by CI and reviewer Codex)

3. **`owned_fixture_assessment_genuine_reserved_hosted_native_objects_db_snapshot`**:
   - The GitHub Actions workflow `dev-owned-operational-fixture-assessment.yml` executes using Operator-only `workflow_dispatch`.
   - It performs an explicit read-only run targeting the established project and identities.

## Test Execution Details

- `python3 -m unittest operations/verification/test_assess_owned_operational_fixtures.py -v`
  - Total tests run: 6
  - Exit code: 0
  - Status: OK

## Boundary Handlers

- `default_gcs_runner`: Uses standard `gcloud storage` to invoke GCS metadata and body inspection. No mutable API invoked.
- `default_db_runner`: Invokes `node db_credentials.mjs` safely, executing `psql` wrapped in `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;`. No PII or raw business records are dumped. Only counts of relationships and objects are calculated.

All steps confirm safe verification and strict read-only guarantees on the environment.
