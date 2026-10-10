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
| **F1 Authentic Authority** | Replaced repository-prefix checks with exact url matches, bound strictly to the expected run ID and artifact ID. | Scoped Pass (Mock tested, real API NOT EXECUTED) |
| **F2 Hosted Rails** | Validated exact tooling run definition, required exact job name to confirm Operator reservation. Privacy and fullscanner checks implemented and strictly assert zero public bindings and exact scanner specs. | Source Inspection / Scoped Pass (Unit tests pass, hosted pending, real runtime NOT EXECUTED) |
| **F3 Native Bounds** | Replaced `subprocess.run(capture_output=True)` with bounded streamed `subprocess.Popen` via `run_bounded` for gcloud secret, node helper, and psql. Enforced strict stdout (512KiB) and stderr (128KiB) limits on all transport paths. | Scoped Pass (Unit tests pass, live execution NOT EXECUTED) |
| **F4/F5 Formal DB** | Maintained full-row hash repair without sampling. Implemented full relationships preservation/reference inventory for `phase1_registry_supply_pairs`, `phase1_registry_exclusivities`, and `audit_logs`. Checked foreign key definitions correctly. | Source Inspection / Scoped Pass (Mock transport passes, live DB snapshot NOT EXECUTED) |
| **F6/F7 Evidence** | Capped arbitrary exception exports and limited `cloud_metadata` fields. Fixed passthrough of unknown DB result fields by projecting only `c` and `digest` fields for preservation inventory, and strict defined properties for `incoming_fks`. | Scoped Pass (Genuine local mock execution, limits enforced) |
| **F8 Publication** | Maintained immutable literal prefix in Git commits (`SR-DEV-OWNED-OPERATIONAL-FIXTURE-ASSESSMENT-20261010:`). | Scoped Pass |

## Execution Bounds and Reporting

The workflow correctly restricts secrets, body, and non-fixture rows. It produces a bounded JSON report which is uploaded as a durable artifact. The report includes selected bounded sanitized receipts of `cloud_metadata` verifying the 9 expected services, scanner properties, API providers, and missing public bindings on private consoles before proceeding.
The DB runner correctly uses bounded streaming output (`run_bounded`) so that GitHub JSON, cloud-metadata JSON, and psql output are strictly capped during execution.
Real ownership (GCS and DB) is clearly differentiated from synthetic disposition. The CLI `main()` executes zero real transport when invoked with `--mock-db`. Error responses are strictly bounded and sanitized. Complete full-row preservation counts and full hashes are performed on all associated tables including `supply_pairs`, `exclusivities`, and `audit_logs`.

## Acceptance Criteria Verified

1. **`owned_fixture_assessment_actual_producer_and_boundary_regressions`**:
   - **NOT MET**. Formal PG limits disclosed; genuine boundary tests run successfully against local mock fixtures, but real actual producer runs are not validated locally. Hosted pending.

2. **`owned_fixture_assessment_exact_sha_review_ci_protected_merge`**:
   - **NOT MET**. To be verified by CI and GitHub PR status once submitted.

3. **`owned_fixture_assessment_genuine_reserved_hosted_native_objects_db_snapshot`**:
   - **NOT EXECUTED / NOT MET**. Genuine reserved immutable Operator/native/formal-submission snapshot not executed in the live environment. Script boundaries defined but execution deferred.
