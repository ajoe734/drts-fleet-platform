# Dev Owned Operational Fixture Assessment (2026-10-10)

## Overview

This UAT document tracks the execution and verification of the genuine guarded hosted read-only assessment for original owned operational fixtures, as specified in `SR-DEV-OWNED-OPERATIONAL-FIXTURE-ASSESSMENT-20261010`.

This assessment does **not** perform any mutation or cleanup. It is strictly a read-only assessment that validates the existence and integrity of specific GCS objects and Postgres database rows, outputting `"assessment_only": true` and `"cleanup_not_performed": true` in all reports.

**Status**: NOT EXECUTED in live environment. All evidence is source/synthetic execution based on the candidate worktree. Source rejection was due to demonstrated source guard/report defects, not merely pending hosted execution.

## Evidence Source Identity
- **Task ID**: SR-DEV-OWNED-OPERATIONAL-FIXTURE-ASSESSMENT-20261010
- **Candidate Generation**: `5e62ee1c21dc4850abf6e6ddc677636e`
- **Candidate SHA**: `[External Candidate Artifact]` (to be resolved by orchestrator upon candidate completion)
- **Reviewer**: Codex
- **Workspace**: Isolated review worktree

## Matrix of repairs and unverified claims

| Finding | Historical / Current Evidence | Remaining Condition / Actual limit |
|---------|-----------------------|--------|
| **F1/F3/F4/F5 core** | Genuine archive/PDF/identity positives and existing denials PASS BOTH | Actual current owned resources/PG not measured |
| **F2 actual authority / inventory** | NEW `HEAD`: Parses actual plural `environments` review-history schema. Enforces strict `path` checking (rather than mutable `name`) for restricted overlapping workflow runs and queries `requested` status. Enforces strict pagination, `total_count`, and job `run_id`/uniqueness constraints to secure shared reservation. Validates that actual collector emits `SCANNER_ENV` object and ensures scanner metadata binding strictly matches producer contract, leaving immutable producer helper unchanged. | Full environment and live authority unmeasured |
| **F3 upstream capture** | `upstream-reader-probe.py` demonstrated `read_json` under exact 256MiB `ulimit` still accepts 2MiB subprocess output, confirming VM byte bound unmet at stream level. | Frozen `read-dev-cloud-metadata.py` capture process remains uncapped. Modification of this frozen helper is unsupported without precise Supervisor conflict-checked scope. The unsupported ulimit path in the workflow has been failed-closed/removed. |
| **F6/F7 report/UAT** | `current-contract` isolated probes confirmed synthetic sentinel exported via `drts-dev-scanner` properties. NEW `HEAD`: enforces typed validation and strictly exports exact nested projection to prevent arbitrary data leakage. Truthful UAT provided with explicit boundary limitations. | True live matrix unavailable locally. |
| **F8 scope/publication** | 17 generic trailer commits PASS. Current subject prefix PASS. | 8 inherited literal prefix failures persist. Supervisor must resolve precise prospective preserved-history disposition. Original history and original cleanup blobs strictly preserved. |

## Execution Bounds and Reporting

The workflow restricts secrets, body, and non-fixture rows. It produces a bounded JSON report uploaded as a durable artifact.
- **Provider & IAM validation**: The script validates providers for `drts-dev-api` and strictly typed IAM bindings.
- **Scanner hash and metadata**: Enforces caller-supplied metadata presence of `scanner_url` on `drts-dev-api`, and validates that `default_environment` on `drts-dev-scanner` strictly matches the `SCANNER_ENV` dictionary contract rather than a string project-ID. It reconstructs the canonical projection without emitting arbitrary nested fields.
- **Cloud Metadata Bounds**: The frozen `read-dev-cloud-metadata.py` upstream process uses an uncapped subprocess capture. Since modification is unsupported without Supervisor scope, the workflow bound wrapper (`ulimit`) was removed.
- **Active-run Inventory Check**: Completely enumerates paginated active jobs for restricted workflow paths across non-terminal states (`in_progress`, `queued`, `waiting`, `pending`, `requested`) and validates against API `total_count` and job uniqueness to ensure a strict shared reservation and fail closed on overlap.
- **Required Check-runs Check**: Strictly requires independent `APPROVED` review on the PR HEAD by checking the correct GitHub API array schema, and verifies exact names of required GitHub checks.

## Acceptance Criteria Verified

1. **`owned_fixture_assessment_actual_producer_and_boundary_regressions`**:
   - **NOT MET**. Source authority/inventory/typed-report gates are implemented, but live environment was not executed due to unresolvable frozen collector bound.

2. **`owned_fixture_assessment_exact_sha_review_ci_protected_merge`**:
   - **NOT MET**. Independent approval and strict CI validation logic is implemented in script, but live protected merge is absent until CI completes.

3. **`owned_fixture_assessment_genuine_reserved_hosted_native_objects_db_snapshot`**:
   - **NOT EXECUTED / NOT MET**. Zero real protected reads.
