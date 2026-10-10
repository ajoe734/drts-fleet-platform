# Dev Owned Operational Fixture Assessment (2026-10-10)

## Overview

This UAT document tracks the execution and verification of the genuine guarded hosted read-only assessment for original owned operational fixtures, as specified in `SR-DEV-OWNED-OPERATIONAL-FIXTURE-ASSESSMENT-20261010`.

This assessment does **not** perform any mutation or cleanup. It is strictly a read-only assessment that validates the existence and integrity of specific GCS objects and Postgres database rows, outputting `"assessment_only": true` and `"cleanup_not_performed": true` in all reports.

**Status**: NOT EXECUTED in live environment. All evidence is source/synthetic execution based on the candidate worktree. Source rejection was due to demonstrated source guard/report defects, not merely pending hosted execution.

## Evidence Source Identity
- **Task ID**: SR-DEV-OWNED-OPERATIONAL-FIXTURE-ASSESSMENT-20261010
- **Candidate Generation**: `913ea1751bfe4949889124b8af99d21f`
- **Candidate SHA**: `49009072f20124fefc6c861de58d88e4d50015bf`
- **Reviewer**: Codex
- **Workspace**: Isolated review worktree

## Matrix of repairs and unverified claims

| Finding | Historical / Current Evidence | Remaining Condition / Actual limit |
|---------|-----------------------|--------|
| **F1/F3/F4/F5 core** | Genuine archive/PDF/identity positives and existing denials PASS BOTH. F4/F5 optional fields are now strict requirements. | Actual current owned resources/PG not measured |
| **F2 actual authority / inventory** | Shared reservation overlap check extracted as dedicated workflow step. Authority and reservation verification runs *before* metadata acquisition in script. | Full environment and live authority unmeasured |
| **F3 upstream capture & bounds** | Producer upgraded to perform bounded reads using `run_bounded` helper for metadata acquisition, GCS `describe`, and `cat` streams (with proper `max_stdout` and timeout polling repairs). | Actual live cloud metadata acquisition unmeasured; no live GCS reads |
| **F6/F7 report/UAT** | Report generation restored genuine constraints. UAT generation/findings aligned with true regression evidence (subprocess.run claims removed, generation updated). | True live matrix unavailable locally. |
| **F8 scope/publication** | Four invalid subjects exist in branch history, violating the literal prefix requirement. The trailer check locally fails on these old commits. | Supervisor must reconcile preserved-history/prospective publication disposition. |

## Execution Bounds and Reporting

The workflow restricts secrets, body, and non-fixture rows. It produces a bounded JSON report uploaded as a durable artifact.
- **Provider & IAM validation**: The script validates providers for `drts-dev-api` and strictly typed IAM bindings, including exact `roles/run.invoker` singletons for `drts-dev-api` and `drts-dev-scanner`.
- **Scanner hash and metadata**: Enforces caller-supplied metadata presence of `scanner_url` on `drts-dev-api`, and validates that `default_environment` on `drts-dev-scanner` strictly matches the contract.
- **Cloud Metadata Bounds**: `run_bounded` restricts execution with explicit memory/stdout caps and strict elapsed-time polling, preventing unbounded streaming.
- **Active-run Inventory Check**: Completely enumerates paginated active jobs for restricted workflow paths across non-terminal states.
- **Required Check-runs Check**: Strictly requires independent `APPROVED` review on the PR HEAD by checking the correct GitHub API array schema, and verifies exact names of required GitHub checks.

## Acceptance Criteria Verified

1. **`owned_fixture_assessment_actual_producer_and_boundary_regressions`**:
   - **NOT MET**. Source authority/inventory/typed-report gates are implemented, but reproduced source failures were only partially repaired in prior runs; live environment was not executed locally. Formal PG limits disclosed.

2. **`owned_fixture_assessment_exact_sha_review_ci_protected_merge`**:
   - **NOT MET**. Independent approval and strict CI validation logic is implemented in script, but live protected merge is absent until CI completes.

3. **`owned_fixture_assessment_genuine_reserved_hosted_native_objects_db_snapshot`**:
   - **NOT EXECUTED / NOT MET**. Zero real protected cloud/GCS/DB/secret reads.
