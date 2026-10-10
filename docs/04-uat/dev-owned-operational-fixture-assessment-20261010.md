# Dev Owned Operational Fixture Assessment (2026-10-10)

## Overview

This UAT document tracks the execution and verification of the genuine guarded hosted read-only assessment for original owned operational fixtures, as specified in `SR-DEV-OWNED-OPERATIONAL-FIXTURE-ASSESSMENT-20261010`.

This assessment does **not** perform any mutation or cleanup. It is strictly a read-only assessment that validates the existence and integrity of specific GCS objects and Postgres database rows, outputting `"assessment_only": true` and `"cleanup_not_performed": true` in all reports.

**Status**: NOT EXECUTED in live environment. All evidence is source/synthetic execution based on the candidate worktree. Source rejection was due to demonstrated source guard/report defects, not merely pending hosted execution.

## Evidence Source Identity
- **Task ID**: SR-DEV-OWNED-OPERATIONAL-FIXTURE-ASSESSMENT-20261010
- **Candidate Generation**: `2684de6a04a84d0f9934fe0aa5595eb4`
- **Candidate SHA**: `HEAD` (to be resolved by orchestrator upon candidate completion)
- **Reviewer**: Codex
- **Workspace**: Isolated review worktree (`cwd: /home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-sr-dev-owned-operational-fixture-assessment-20261010`)

## Matrix of repairs and unverified claims

| Finding | Historical / Current Evidence | Remaining Condition / Actual limit |
|---------|-----------------------|--------|
| **F1/F3/F4/F5 core** | Genuine archive/PDF/identity positives and existing denials PASS BOTH | Actual current owned resources/PG not measured |
| **F2 actual authority / inventory** | OLD `b9f4e05571cb`: 25 reads/complete on unavailable authority/incomplete inventory. NEW `HEAD`: 0 reads, fail closed on missing/foreign PR approval, incomplete CI check-runs, incomplete active-run pagination, missing scanner environment/revision metadata. | Full environment and live authority unmeasured |
| **F3 upstream capture** | OLD/NEW: Selected overflow bounded to 555 bytes. Frozen `read-dev-cloud-metadata.py` capture process remains strictly uncapped in its subprocess call. | The workflow bounds the frozen helper with `ulimit -v 262144` to prevent unbounded allocation. |
| **F6/F7 report/UAT** | OLD `b9f4e05571cb`: inaccurate matrix claims without exact SHA pairs. NEW `HEAD`: Truthful UAT provided with explicit boundary limitations. | True live matrix unavailable locally. |
| **F8 scope/publication** | 16 generic trailer commits PASS. 7 inherited literal-prefix failures remain. | Awaiting Supervisor preserved-history disposition. Current commit subject strictly complies. |

## Execution Bounds and Reporting

The workflow restricts secrets, body, and non-fixture rows. It produces a bounded JSON report uploaded as a durable artifact.
- **Provider & IAM validation**: The script validates providers for `drts-dev-api` and strictly typed IAM bindings.
- **Scanner hash and metadata**: Enforces caller-supplied metadata presence of `ready_revision`, `images`, `scanner_url`, and specifically requires `default_environment` to match `drts-dev-devcc-20260825`.
- **Cloud Metadata Bounds**: The frozen `read-dev-cloud-metadata.py` upstream process uses an uncapped subprocess capture. To enforce boundaries without modifying the frozen file, the workflow wraps the execution with a 256MB virtual memory `ulimit -v 262144`.
- **Active-run Inventory Check**: Completely enumerates paginated active jobs for restricted workflow names across non-terminal states (`in_progress`, `queued`, `waiting`, `pending`) and validates against API `total_count` to ensure a strict shared reservation and fail closed on overlap.
- **Required Check-runs Check**: Strictly requires independent `APPROVED` review on the PR HEAD and verifies exact names of required GitHub checks (`Commit trailers`, `Runtime mirror guard`, `Smoke acceptance`, `ci-integ`).

## Acceptance Criteria Verified

1. **`owned_fixture_assessment_actual_producer_and_boundary_regressions`**:
   - **NOT MET**. Source authority/inventory/typed-report gates are implemented, but live environment was not executed.

2. **`owned_fixture_assessment_exact_sha_review_ci_protected_merge`**:
   - **NOT MET**. Independent approval and strict CI validation logic is implemented in script, but live protected merge is absent until CI completes.

3. **`owned_fixture_assessment_genuine_reserved_hosted_native_objects_db_snapshot`**:
   - **NOT EXECUTED / NOT MET**. Zero real protected reads.
