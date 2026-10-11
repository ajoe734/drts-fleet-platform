# Dev Owned Operational Fixture Assessment (2026-10-10)

## Overview

This UAT document tracks the execution and verification of the genuine guarded hosted read-only assessment for original owned operational fixtures, as specified in `SR-DEV-OWNED-OPERATIONAL-FIXTURE-ASSESSMENT-20261010`.

This assessment does **not** perform any mutation or cleanup. It is strictly a read-only assessment that validates the existence and integrity of specific GCS objects and Postgres database rows, outputting `"assessment_only": true` and `"cleanup_not_performed": true` in all reports.

**Status**: NOT EXECUTED in live environment. All evidence is source/synthetic execution based on the candidate worktree. Source rejection was due to demonstrated source guard/report defects, not merely pending hosted execution.

## Evidence Source Identity
- **Task ID**: SR-DEV-OWNED-OPERATIONAL-FIXTURE-ASSESSMENT-20261010
- **Candidate Generation**: `04a772aa4b274097b7107e2b91aedef8`
- **Candidate SHA**: `[External Candidate Artifact]` (to be resolved by orchestrator upon candidate completion, linked via review-verdict.md identity)
- **Reviewer**: Codex
- **Workspace**: Isolated review worktree

## Matrix of repairs and unverified claims

| Finding | Historical / Current Evidence | Remaining Condition / Actual limit |
|---------|-----------------------|--------|
| **F1/F3/F4/F5 core** | Genuine archive/PDF/identity positives and existing denials PASS BOTH | Actual current owned resources/PG not measured |
| **F2 actual authority / inventory** | NEW `HEAD`: Script parses GitHub API boolean values properly (not as comments) and restricts bounded held window. Authority runs *before* metadata acquisition. | Full environment and live authority unmeasured |
| **F3 upstream capture** | NEW `HEAD`: Producer upgraded to perform strict scanner identity resolution (allowing runtime + deployer), regex matches scanner URL, and strictly matches scanner gateway/clamd containers. | Actual live cloud metadata acquisition unmeasured |
| **F6/F7 report/UAT** | NEW `HEAD`: Real regression matrix properly handles errors via try-except, retaining partial observations instead of wiping receipts. Committed actual trigger tests (18 tests passed) and verified real command / exit. | True live matrix unavailable locally. |
| **F8 scope/publication** | Official subjects FIXED (commits PASS, literal own prefix PASS). | Supervisor must verify exact prospective preserved-history/publication disposition. No history rewrite authorized. |

## Execution Bounds and Reporting

The workflow restricts secrets, body, and non-fixture rows. It produces a bounded JSON report uploaded as a durable artifact.
- **Provider & IAM validation**: The script validates providers for `drts-dev-api` and strictly typed IAM bindings.
- **Scanner hash and metadata**: Enforces caller-supplied metadata presence of `scanner_url` on `drts-dev-api`, and validates that `default_environment` on `drts-dev-scanner` strictly matches the `SCANNER_ENV` dictionary contract.
- **Cloud Metadata Bounds**: Replaced the uncapped frozen python helper with an inline `run_bounded` wrapper inside `assess-owned-operational-fixtures.py`, successfully retaining containment against memory bloat.
- **Active-run Inventory Check**: Completely enumerates paginated active jobs for restricted workflow paths across non-terminal states.
- **Required Check-runs Check**: Strictly requires independent `APPROVED` review on the PR HEAD by checking the correct GitHub API array schema, and verifies exact names of required GitHub checks.

## Acceptance Criteria Verified

1. **`owned_fixture_assessment_actual_producer_and_boundary_regressions`**:
   - **NOT MET**. Source authority/inventory/typed-report gates are implemented, but live environment was not executed locally.

2. **`owned_fixture_assessment_exact_sha_review_ci_protected_merge`**:
   - **NOT MET**. Independent approval and strict CI validation logic is implemented in script, but live protected merge is absent until CI completes.

3. **`owned_fixture_assessment_genuine_reserved_hosted_native_objects_db_snapshot`**:
   - **NOT EXECUTED / NOT MET**. Zero real protected reads.

## Local Execution Evidence

```
Command: python3 -m unittest tests/unit/gcp-artifact-activation-20261004/test_owned_operational_fixture_assessment.py -v
CWD: /home/lupin/workspace/drts-fleet-platform
Version: Python 3.12
Exit: 0
Log:
Ran 18 tests in 0.134s
OK
```

```
Command: python3 -m unittest tests/unit/gcp-artifact-activation-20261004/test_owned_operational_fixture_cleanup.py -v
CWD: /home/lupin/workspace/drts-fleet-platform
Version: Python 3.12
Exit: 0
Log:
Ran 63 tests in 0.038s
OK
```
