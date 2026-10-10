# Dev Owned Operational Fixture Assessment (2026-10-10)

## Overview

This UAT document tracks the execution and verification of the genuine guarded hosted read-only assessment for original owned operational fixtures, as specified in `SR-DEV-OWNED-OPERATIONAL-FIXTURE-ASSESSMENT-20261010`.

This assessment does **not** perform any mutation or cleanup. It is strictly a read-only assessment that validates the existence and integrity of specific GCS objects and Postgres database rows, outputting `"assessment_only": true` and `"cleanup_not_performed": true` in all reports.

**Status**: NOT EXECUTED in live environment. All evidence is source/synthetic execution based on the candidate worktree. Source rejection was due to demonstrated source guard/report defects, not merely pending hosted execution.

## Evidence Source Identity
- **Task ID**: SR-DEV-OWNED-OPERATIONAL-FIXTURE-ASSESSMENT-20261010
- **Candidate Generation**: `5179dc4b159a4b5fa3c90a9f7067b751`
- **Candidate SHA**: `340797001822872611083257bd4583ef0c24bad4`
- **Reviewer**: Codex
- **Workspace**: `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-sr-dev-owned-operational-fixture-assessment-20261010`

## Matrix of repairs and unverified claims

| Finding | Historical / Current Evidence | Remaining Condition / Actual limit |
|---------|-----------------------|--------|
| **F1/F3/F4/F5 core** | Genuine archive/PDF/identity positives and existing denials PASS BOTH. F4/F5 optional fields are now strict requirements. | Actual current owned resources/PG not measured |
| **F2 actual authority / inventory** | Authority now verifies the latest approval is strictly `approved` (preventing superseded claims), validates active workflow path. | Full environment and live authority unmeasured |
| **F3 upstream capture & bounds** | Collector validates `metadata.name`, service `Ready` condition, traffic routing 100% to `latestReadyRevisionName`, revision matching `latestCreatedRevisionName`, labels matching service, and revision `Ready` condition. IAM policy explicitly rejects conditional bindings. | Actual live cloud metadata acquisition unmeasured; no live GCS reads |
| **F6/F7 report/UAT** | UAT updated to truthfully reflect the generation and accurate reservation/API singleton requirements. Added 4 regression tests for F3 bounds: not_ready, traffic_not_100, latest_created_mismatch, revision_not_ready. Total 17 unit tests PASS. | True live matrix unavailable locally. |
| **F8 scope/publication** | 4 original commits lack task-prefix; the blocker has been reported. New anchor commits will be added with proper prefix, but history rewrite is forbidden. | Supervisor must reconcile preserved-history/prospective publication disposition. |

## Execution Bounds and Reporting

The workflow restricts secrets, body, and non-fixture rows. It produces a bounded JSON report uploaded as a durable artifact.
- **Provider & IAM validation**: The script validates providers for `drts-dev-api` and strictly typed IAM bindings, including exact `roles/run.invoker` singletons for `drts-dev-api` and `drts-dev-scanner`, while explicitly rejecting conditional bindings.
- **Scanner hash and metadata**: Enforces caller-supplied metadata presence of `scanner_url` on `drts-dev-api`, and validates that `default_environment` on `drts-dev-scanner` strictly matches the contract.
- **Cloud Metadata Bounds**: `run_bounded` restricts execution with explicit memory/stdout caps and strict elapsed-time polling, preventing unbounded streaming.
- **Active-run Inventory Check**: Completely enumerates paginated active jobs for restricted workflow paths across non-terminal states.
- **Required Check-runs Check**: Strictly requires independent `APPROVED` review on the PR HEAD by checking the correct GitHub API array schema, and verifies exact names of required GitHub checks.

## Acceptance Criteria Verified

1. **`owned_fixture_assessment_actual_producer_and_boundary_regressions`**:
   - **NOT MET**. Source authority/inventory/typed-report gates are implemented and passed locally (17 unit tests PASS), but live environment was not executed locally. Formal PG limits disclosed.

2. **`owned_fixture_assessment_exact_sha_review_ci_protected_merge`**:
   - **NOT MET**. Independent approval and strict CI validation logic is implemented in script, but live protected merge is absent until CI completes.

3. **`owned_fixture_assessment_genuine_reserved_hosted_native_objects_db_snapshot`**:
   - **NOT EXECUTED / NOT MET**. Zero real protected cloud/GCS/DB/secret reads.
