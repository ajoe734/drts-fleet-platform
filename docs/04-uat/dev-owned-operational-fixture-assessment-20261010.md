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

1. **F1**: Authentic producer authority (Completed)
   - Checks: Workflow fetches jobs, paginates artifacts, validates exact archive members, strictly verifies `confirmDocumentType`, `workflow_sha` and `fleet-demo-001`. Fixes missing artifact name matching actual `source_sha`. Fixes missing correct ZIP file member checks.
   - Result: Tests updated to simulate genuine 5850-byte ZIP and exact properties. Mock transport tests PASS.
2. **F2**: Hosted rails and Operator protection (Completed)
   - Checks: Workflow verifies `github.sha` merge base against `dev` (ensuring CI/protected merge) BEFORE authentication step.
   - Result: Implemented in workflow. Live cloud execution skipped.
3. **F3**: Native GCS boundaries (Completed)
   - Checks: Scripts strictly match bucket and name on initial retrieval and rechecks, bounds `timeCreated`/`updated`/`stored-at`, enforces bounded `subprocess.Popen.communicate()` up to 10MiB with proper timeout.
   - Result: Mock transport tests PASS. Real cloud execution skipped.
4. **F4/F5**: Formal snapshot & DB bounds (Completed)
   - Checks: Scripts check transaction mode (`tx_ro`, `tx_iso`), negative reference counts, and specific foreign references exist. Checks `revision_no`, `checksum_sha256`, `submission_id`, `created_at` matching correct canonical values. Implemented strict `psql` timeouts, readiness probes, and lock bounds.
   - Result: DB transport mocks PASS. Live Postgres DB check skipped.
5. **F6/F7**: UAT Claims and committed evidence (Completed)
   - Checks: Workflow includes upload-artifact for `assessment-report.json`. Mocks correctly replicate exact expected file sizes and real hashes.
   - Result: Verified. Mock transport tests PASS.
6. **F8**: Publication
   - Result: Prefix matched strictly in commits: `SR-DEV-OWNED-OPERATIONAL-FIXTURE-ASSESSMENT-20261010`.

## Execution Bounds and Reporting

The workflow correctly restricts secrets, body, and non-fixture rows. It produces a bounded hosted JSON report which is uploaded as a durable artifact.
Real ownership (GCS and DB) is clearly differentiated from synthetic disposition.
The CLI `main()` executes zero real transport when invoked with `--mock-db`. Error responses are strictly sanitized, removing raw tool output leakage.

## Acceptance Criteria Verified

1. **`owned_fixture_assessment_actual_producer_and_boundary_regressions`**:
   - Completed (via tests). Genuine boundary tests run successfully with exact PDF bytes without mocking hash validators.

2. **`owned_fixture_assessment_exact_sha_review_ci_protected_merge`**:
   - Unexecuted. To be verified by CI and GitHub PR status once submitted.

3. **`owned_fixture_assessment_genuine_reserved_hosted_native_objects_db_snapshot`**:
   - NOT EXECUTED in the live environment. Script boundaries defined but execution deferred to Operator in isolated run.
