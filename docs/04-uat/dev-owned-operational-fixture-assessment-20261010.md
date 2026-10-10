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

| Finding | OLD -> current evidence | Remaining condition |
|---------|-----------------------|--------|
| **F1 actual provenance** | Genuine archive/PDF/identity positives and existing denials PASS BOTH | Actual current owned resources/PG not measured |
| **F2 missing privacy field** | SAME OLD25calls -> NEW0; repaired | Preserve this and missing/public-binding denials |
| **F2 actual authority / privacy** | SAME named-job/mixedCI/partialCI/partialactive/missingmembers BOTH25calls; authority9 OLD2PASS7FAIL -> NEW4PASS5FAIL; report04 wrong remittance providers BOTH25 | Actual compatible reviewed/protected completeCI/Operator/reservation/current full private/provider/scanner authority |
| **F3 transport/receipts** | SAME OLD25 -> NEW0; repaired; candidate helper8PASS | Frozen metadata capture remains uncapped |
| **F4/F5 count/definition** | SAME duplicate OLDsuccess -> NEWrejected; lawful5FK/formal-wire and relation10 PASS | Genuine formal migrated-PG snapshot unavailable |
| **F6/F7 report/UAT** | NEW nested unknown-field export and 537081-byte error, OLD absent/small; native rejection lacks envelope BOTH (Fixed in code: strict schema/bounds added) | Strict selected fields/schema/all-outcome byte bounds and truthful UAT |
| **F8 scope/publication** | Net4/frozen4/original63PASS; official14trailerPASS; seven literal-prefixFAIL including candidate | Exact prospective Supervisor preserved-history disposition |

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
