# Dev Owned Operational Fixture Assessment (2026-10-10)

## Overview

This UAT document tracks the execution and verification of the genuine guarded hosted read-only assessment for original owned operational fixtures, as specified in `SR-DEV-OWNED-OPERATIONAL-FIXTURE-ASSESSMENT-20261010`.

This assessment does **not** perform any mutation or cleanup. It is strictly a read-only assessment that validates the existence and integrity of specific GCS objects and Postgres database rows, outputting `"assessment_only": true` and `"cleanup_not_performed": true` in all reports.

**Status**: NOT EXECUTED in live environment. All evidence is source/synthetic execution based on the candidate worktree. No actual cloud/DB read was performed by this UAT.

## Evidence Source Identity
- **Task ID**: SR-DEV-OWNED-OPERATIONAL-FIXTURE-ASSESSMENT-20261010
- **Candidate SHA**: (To be captured at handoff)
- **Reviewer**: Codex
- **Workspace**: Isolated review worktree
- **Python Version**: 3.12.3

## Old -> New Finding Outcomes

1. **F1**: Raw IDs authorize reads without authentic preflight.
   *New Outcome*: Script fetches authoritative ZIP via `gh api` using workflow/artifact IDs, verifies SHA256 digest, extracts `operational-browser-evidence.json`, and asserts ALL 8 objects exist with valid signatures *before* GCS reads.
2. **F9**: Wrong bucket and original inventory replaced.
   *New Outcome*: Bucket restored to `drts-dev-devcc-20260825-document-artifacts`. Exact 8 missing/replaced CANONICAL_OWNED_OBJECTS restored to identical states from original cleanup script.
3. **F2**: Hosted rails unenforced, new metadata invocation fails.
   *New Outcome*: Workflow securely passes `--expected-runtime-sha`, `--definition-sha`, and `--output` to `read-dev-cloud-metadata.py`. Paginated cross-workflow `gh api` reservation check added.
4. **F10**: Input shell expansion before Python validation.
   *New Outcome*: Inputs passed to script strictly via environment variables (`INPUT_PRODUCT_RUN_ID`, etc.), preventing shell evaluation.
5. **F3**: Pinning fix leaves identity/time/bounds open.
   *New Outcome*: Checks `timeCreated`/`updated` 2026-10-09 boundaries, robust 404/rejection responses, generation bounds, and exact numeric validation in Python script.
6. **F4**: Hosted DB connectivity lacking secure enforcement.
   *New Outcome*: `cloud-sql-proxy` explicitly downloaded in workflow. Python securely connects via `pgpass` file with strict flags (`-X -q -A -t --no-password --set=ON_ERROR_STOP=1`) imitating authorized restore_drill behavior.
7. **F5**: Independent counts lack ownership/retention/preservation.
   *New Outcome*: A single coherent `REPEATABLE READ READ ONLY` transaction computes all 6 dependent tables simultaneously, returning a single JSON.
8. **F6**: Tests replace trusted validation constant.
   *New Outcome*: `EXPECTED_SHA256` monkeypatch removed. `test_owned_operational_fixture_assessment.py` updated to use authentic `PDF_BYTES` fixture.

## Acceptance Criteria Verified

1. **`owned_fixture_assessment_actual_producer_and_boundary_regressions`**:
   - Genuine boundary tests run successfully with exact PDF bytes without mocking hash validators.

2. **`owned_fixture_assessment_exact_sha_review_ci_protected_merge`**:
   - To be verified by CI and GitHub PR status.

3. **`owned_fixture_assessment_genuine_reserved_hosted_native_objects_db_snapshot`**:
   - Currently NOT EXECUTED in the live environment. Script boundaries defined but execution deferred to Operator in isolated run.
