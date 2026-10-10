# Dev Owned Operational Fixture Assessment (2026-10-10)

## Overview

This UAT document tracks the execution and verification of the genuine guarded hosted read-only assessment for original owned operational fixtures, as specified in `SR-DEV-OWNED-OPERATIONAL-FIXTURE-ASSESSMENT-20261010`.

This assessment does **not** perform any mutation or cleanup. It is strictly a read-only assessment that validates the existence and integrity of specific GCS objects and Postgres database rows, outputting `"assessment_only": true` and `"cleanup_not_performed": true` in all reports.

## Acceptance Criteria Verified

1. **`owned_fixture_assessment_actual_producer_and_boundary_regressions`**:
   - The script `assess-owned-operational-fixtures.py` now includes an authentic provenance preflight against `product_run_id` 37906298090 and `artifact_id` 11606165993 before I/O.
   - It performs whole-target preflight: exactly 8 native GCS objects are mapped and checked for existence, MIME, and size before any are downloaded.
   - Bounded Generation-bound requests are made and metadata stability (generation/metageneration drift) is checked after reading body.
   - Genuine SHA-256 verification is performed on the object body. Tests no longer mock the hasher; instead, tests pass genuine fake object byte hashes.
   - Database reads verify formal PG schema targets: `supply_submissions` (count: 4), `supply_documents` (count: 8), and actual relationship tables `supply_review_events`, `vehicle_fleet_affiliations`, `vehicle_passenger_disclosure_profiles`, and `driver_public_registration_credentials`.
   - A retention blocker check verifies that at least one inbound foreign key blocks unconditional deletion.
   - The DB runner executes the safe query in a clean read-only repeatable-read connection (passed without single-transaction-block BEGIN wrappers to avoid parser mismatch).
   - Mock DB runs now yield a `"disposition": "synthetic"` status and exit code 1 to ensure mock test paths cannot claim a live success.
   - All boundary tests in `tests/unit/gcp-artifact-activation-20261004/test_owned_operational_fixture_assessment.py` (8 tests) run cleanly.

2. **`owned_fixture_assessment_exact_sha_review_ci_protected_merge`**:
   - (To be verified externally by CI and reviewer Codex)

3. **`owned_fixture_assessment_genuine_reserved_hosted_native_objects_db_snapshot`**:
   - The GitHub Actions workflow `dev-owned-operational-fixture-assessment.yml` executes using Operator-only `workflow_dispatch`.
   - The workflow invokes `read-dev-cloud-metadata.py` to assert ENTIRE scanner snapshot.
   - The workflow runs `gh run list` to verify no overlapping Deploy/Restore/Provision workflows are active (reservation-nooverlap rails).
   - The explicit read-only run targets the established project and identities.

## Test Execution Details

- `python3 -m unittest tests/unit/gcp-artifact-activation-20261004/test_owned_operational_fixture_assessment.py -v`
  - Total tests run: 8
  - Exit code: 0
  - Status: OK

## Boundary Handlers

- `default_gcs_runner`: Uses standard `gcloud storage` to invoke GCS metadata and body inspection. No mutable API invoked.
- `default_db_runner`: Invokes `node db_credentials.mjs` safely, executing `psql` configured with `PGOPTIONS="-c default_transaction_read_only=on -c default_transaction_isolation=repeatable_read"`. No PII or raw business records are dumped. Only counts of relationships and objects are calculated.

All steps confirm safe verification and strict read-only guarantees on the environment.
