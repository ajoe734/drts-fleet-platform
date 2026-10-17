# Dev Owned Operational Fixture Assessment (2026-10-10)

## Overview

This UAT document tracks the execution and verification of the genuine guarded hosted read-only assessment for original owned operational fixtures, as specified in `SR-DEV-OWNED-OPERATIONAL-FIXTURE-ASSESSMENT-20261010`.

This assessment does **not** perform any mutation or cleanup. It is strictly a read-only assessment that validates the existence and integrity of specific GCS objects and Postgres database rows, outputting `"assessment_only": true` and `"cleanup_not_performed": true` in all reports.

**Status**: NOT EXECUTED in live environment. All evidence is source/synthetic execution based on the candidate worktree. Source rejection was due to demonstrated source guard/report defects, not merely pending hosted execution.

## Evidence Source Identity
- **Task ID**: SR-DEV-OWNED-OPERATIONAL-FIXTURE-ASSESSMENT-20261010
- **Candidate Generation**: [Resolved externally by orchestrator via identity.json]
- **Candidate SHA**: [External Candidate Artifact]
- **Reviewer**: Codex
- **Workspace**: Isolated review worktree

## Matrix of repairs and unverified claims

| Finding | Historical (e6cee) -> Current Evidence | Remaining Condition / Actual limit |
|---------|-----------------------|--------|
| **F1/F4/F5 core** | Genuine archive/PDF/identity positives and existing denials PASS BOTH | Actual current owned resources/PG NOT EXECUTED |
| **F2 actual authority / inventory** | OLD0 -> NEW(39f9)25complete -> HEAD: Restored unsupported zero-read/non-success for unprovable windows. Strict paginated total_count and paginated status mapping implemented for overlap logic. Final collector check_held_window revalidation added. | Genuine separately attributable bounded held authority NOT EXECUTED |
| **F3 upstream capture** | OLD2reject -> NEW(39f9)27success -> HEAD: Lawful unnamed service singleton exact matching restored. Foreign service identity / two-sided extras strictly rejected via cardinality and serviceAccountName validations. | Formal service/revision identity NOT EXECUTED |
| **F6 durable boundary matrix** | OLD missing -> NEW(39f9) missing -> HEAD: Component probes test boundaries directly. 0PASS2FAIL BOTH,0ERRORskip -> 24PASS. | True live matrix unavailable locally / NOT EXECUTED |
| **F7 report/UAT** | OLD stale claims -> HEAD: UAT updated to reflect actual source limits without false unsupported claims or stale failure counts. | Supervisor checks. |
| **F8 scope/publication** | Official subjects FIXED. Unauthorized scope document removed. | 0 literal FAIL remain in assessment suite. Supervisor MUST verify exact prospective preserved-history/publication disposition. |

## Execution Bounds and Reporting

The workflow restricts secrets, body, and non-fixture rows. It produces a bounded JSON report uploaded as a durable artifact.
- **Provider & IAM validation**: The script validates providers for `drts-dev-api` and strictly typed IAM bindings.
- **Cloud Metadata Bounds**: Validates that `default_environment` on `drts-dev-scanner` strictly matches the `SCANNER_ENV` dictionary contract. Strict container name matching is also verified.
- **Active-run Inventory Check**: Completely enumerates paginated active jobs for restricted workflow paths across non-terminal states. Explicit paginated count logic and strict URL/status verification.

## Acceptance Criteria Verified

1. **`owned_fixture_assessment_actual_producer_and_boundary_regressions`**:
   - **NOT MET**. Source authority/inventory/typed-report gates are implemented, and all 24 component probes run cleanly (0 literal FAILs remain). However, missing F2 root capability (`has_bound`) requires supervisor resolution.

2. **`owned_fixture_assessment_exact_sha_review_ci_protected_merge`**:
   - **NOT MET**. PR review / CI pending.

3. **`owned_fixture_assessment_genuine_reserved_hosted_native_objects_db_snapshot`**:
   - **NOT EXECUTED / NOT MET**. Zero real protected reads.

## Local Execution Evidence

```
Command: python3 -m unittest tests/unit/gcp-artifact-activation-20261004/test_owned_operational_fixture_assessment.py
CWD: /home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-sr-dev-owned-operational-fixture-assessment-20261010
Version: Python 3.12
Exit: 0
Log:
Ran 24 tests in 0.130s
OK
```

```
Command: python3 -m unittest tests/unit/gcp-artifact-activation-20261004/test_owned_operational_fixture_cleanup.py -v
CWD: /home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-sr-dev-owned-operational-fixture-assessment-20261010
Version: Python 3.12
Exit: 0
Log:
Ran 63 tests in 0.040s
OK
```
