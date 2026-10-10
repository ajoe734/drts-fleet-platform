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
| **F1 Authentic Authority** | Replaced repository-prefix checks with exact `url` and `html_url` match for jobs and `archive_download_url`/`url` for artifacts, bound strictly to the `args.product_run_id` and artifact ID. | PARTIAL (Mock tested, real API NOT EXECUTED) |
| **F2 Hosted Rails** | Updated `--tooling-run-sha` CLI argument separated from product SHA. Validated exact tooling run definition (`dev-owned-operational-fixture-assessment.yml`) and required exact job name (`Owned fixture assessment (Read-only GCS / DB)`) to confirm Operator reservation without fabricating caller receipts. | PARTIAL (Unit tests pass, real runtime NOT EXECUTED) |
| **F3 Native Bounds** | Added `os.set_blocking(p.stderr.fileno(), False)` and drained both streams via `select.select([p.stdout, p.stderr])`. Enforced finite 1MB buffer cap on stderr alongside 10MB stdout cap and overall 30s timeout to resolve deadlock. | PARTIAL (Unit tests pass, GCS NOT EXECUTED) |
| **F4/F5 Formal DB** | Added `c` (CASCADE) to allowed FK `confdeltype`. Expanded validation of `fks_meta` to require exactly 5 predefined formal relations and reject extraneous bounds. Validated exact canonical counts for `cveh`, `cpol`, and `ccont`. Replaced whole-table string_agg hashes with bounded `LIMIT 1000` + `left(t::text, 256)` partial subset digests and enforced subset `c` count floors against exact fixture expected size. | PARTIAL (Mock transport passes, live DB snapshot NOT EXECUTED) |
| **F6/F7 Evidence** | Capped arbitrary exception exports to 128 chars. Limited `cloud_metadata` inclusion to exact structured fields (`project`, `region`, `definition_sha`, `observed_at`). Removed full-environment overclaims. | PARTIAL (Genuine local mock execution, true positive limits explicitly declared) |
| **F8 Publication** | Maintained immutable literal prefix in Git commits (`SR-DEV-OWNED-OPERATIONAL-FIXTURE-ASSESSMENT-20261010:`). Pending exact prospective fixture scope/publication disposition from Supervisor. | PARTIAL (Pending Supervisor disposition) |

## Execution Bounds and Reporting

The workflow correctly restricts secrets, body, and non-fixture rows. It produces a bounded JSON report which is uploaded as a durable artifact. The report includes selected bounded sanitized receipts of `cloud_metadata` verifying the 9 expected services, scanner properties, API providers, and missing public bindings on private consoles before proceeding.
Real ownership (GCS and DB) is clearly differentiated from synthetic disposition.
The CLI `main()` executes zero real transport when invoked with `--mock-db`. Error responses are strictly bounded and sanitized. Broad preservation counts and subset digests exist for tracking actual unchanged state.

## Acceptance Criteria Verified

1. **`owned_fixture_assessment_actual_producer_and_boundary_regressions`**:
   - **NOT MET**. Formal PG limits disclosed; no runtime waiver. Genuine boundary tests run successfully with exact PDF bytes in unit tests against local mock fixtures, but real actual producer runs are not validated locally.

2. **`owned_fixture_assessment_exact_sha_review_ci_protected_merge`**:
   - **NOT MET**. To be verified by CI and GitHub PR status once submitted.

3. **`owned_fixture_assessment_genuine_reserved_hosted_native_objects_db_snapshot`**:
   - **NOT EXECUTED / NOT MET**. Genuine reserved immutable Operator/native/formal-submission snapshot not executed in the live environment. Script boundaries defined but execution deferred.
