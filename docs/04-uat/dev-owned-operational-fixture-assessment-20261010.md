# Dev Owned Operational Fixture Assessment (2026-10-10)

## Overview

This UAT document tracks the execution and verification of the genuine guarded hosted read-only assessment for original owned operational fixtures, as specified in `SR-DEV-OWNED-OPERATIONAL-FIXTURE-ASSESSMENT-20261010`.

This assessment does **not** perform any mutation or cleanup. It is strictly a read-only assessment that validates the existence and integrity of specific GCS objects and Postgres database rows, outputting `"assessment_only": true` and `"cleanup_not_performed": true` in all reports.

**Status**: NOT EXECUTED in live environment. All evidence is source/synthetic execution based on the candidate worktree. No actual cloud/DB read was performed by this UAT. Source rejection was due to demonstrated source guard/report defects, not merely pending hosted execution.

## Evidence Source Identity
- **Task ID**: SR-DEV-OWNED-OPERATIONAL-FIXTURE-ASSESSMENT-20261010
- **Candidate SHA**: `HEAD` (to be recorded by orchestrator)
- **Reviewer**: Codex
- **Workspace**: Isolated review worktree (`cwd: /home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-sr-dev-owned-operational-fixture-assessment-20261010`)
- **Python Version**: 3.12.3

## Detailed Finding Execution Logs

Command run for tests: `python3 -m unittest tests/unit/gcp-artifact-activation-20261004/test_owned_operational_fixture_assessment.py -v` (Exit Code 0).
Actual executed scope was local unit tests with mocked API endpoints.

### Matrix of repairs and unverified claims

| Finding | Historical / Current Evidence | Remaining Condition / Actual limit |
|---------|-----------------------|--------|
| **F1 actual provenance** | Genuine archive/PDF/identity positives and existing denials PASS BOTH | Actual current owned resources/PG not measured |
| **F2 missing privacy field** | SAME OLD25calls -> NEW0; repaired | Preserve missing/public-binding denials |
| **F2 actual authority / privacy** | FIXED: Paginated CI suites require all success, checks Operator approval and merges. Added all API providers and strictly typed IAM binding checks. | Full environment and live authority unmeasured |
| **F3 transport/receipts** | FIXED: Selected overflow bounded to 555 bytes. | `read-dev-cloud-metadata.py` capture process remains strictly uncapped (frozen helper out of scope) |
| **F4/F5 count/definition** | SAME duplicate OLDsuccess -> NEWrejected; lawful5FK/formal-wire and relation10 PASS | Genuine formal migrated-PG snapshot unavailable |
| **F6/F7 report/UAT** | FIXED: API unknown-field sentinel absent in export. Native rejection schema added. Truthful UAT provided. | True live matrix unavailable locally. |
| **F8 scope/publication** | Official 15 trailers PASS. Current subject complies. | 7 inherited literal-prefix failures remain (awaiting Supervisor preserved-history disposition). |

## Execution Bounds and Reporting

The workflow restricts secrets, body, and non-fixture rows. It produces a bounded JSON report uploaded as a durable artifact.
- **Provider validation**: The script validates 6 provider variables for `drts-dev-api`.
- **IAM validation**: Strictly typed validation requiring exactly `role` (string) and `members` (list of strings).
- **Scanner hash**: Compared against caller-supplied metadata (the full immutable tooling authority check provides assurance over the metadata file source).
- **Cloud Metadata Bounds**: Output serialization is strictly bounded and sanitizes fallback errors. Note that the frozen `read-dev-cloud-metadata.py` upstream process itself uses an uncapped subprocess capture, which is out of bounds to modify but disclosed here.
- **Mock DB**: `--mock-db` prevents protected GCS/DB reads, but still executes GitHub API calls to fetch runs and suites unless those endpoints are externally mocked. It is not a zero-external-transport route.

## Acceptance Criteria Verified

1. **`owned_fixture_assessment_actual_producer_and_boundary_regressions`**:
   - **NOT MET**. 72=61PASS11 failed methods,0errors; scoped11/helper8PASS. Source authority/typed-report gates are implemented, but live environment was not executed.

2. **`owned_fixture_assessment_exact_sha_review_ci_protected_merge`**:
   - **NOT MET**. Independent approval and CI validation logic is implemented in script, but live protected merge is absent until CI completes.

3. **`owned_fixture_assessment_genuine_reserved_hosted_native_objects_db_snapshot`**:
   - **NOT EXECUTED / NOT MET**. Genuine reserved immutable Operator/native/formal-submission snapshot not executed. Zero actual protected reads were performed locally.
