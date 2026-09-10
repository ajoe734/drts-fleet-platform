# Driver Leave Acceptance Runner — SR-LEAVE-BE-001-ACCEPTANCE-RUNNER

- **Task ID**: `SR-LEAVE-BE-001-ACCEPTANCE-RUNNER`
- **Owner**: `Gemini`
- **Reviewer**: `Claude2`
- **Wave / Phase**: `system-remediation-20260906`
- **Parent Task**: `SR-LEAVE-BE-001` (請假資料與審核／班次連動服務)
- **Status**: `in_progress`

## 1. Why this workflow exists

`SR-LEAVE-BE-001` specifies authoritative driver leave lifecycle management, shift suppression, and concurrency invariants:
1. **Initial candidate `173cd462e7a66b3528bcd1818d86723d0ece4958` regression**:
   Independent regression recorded in `.local/worker-recovery-20260910/leave-independent-regression.json` proved two critical defects in the initial candidate:
   - When the enabled database rejected writes, the repository acknowledged the save as successful rather than failing closed.
   - Simultaneous approval and withdrawal on the same leave request both succeeded (`fulfilled`), violating mutual exclusion.
2. **Subsequent candidate `01107f3879c4c41fbb7cd684ee0b9229e7512c5e` regression**:
   While candidate `01107f38` resolved fail-closed DB writes and row-level CAS for review/withdraw, Codex independent regression in `.local/worker-recovery-20260910/leave-create-overlap-race.json` identified that concurrent `createLeave` calls for the same driver still suffered from a check-then-act race: `service.createLeave` awaited `findOverlapping` and then performed an unconditional save without transactional exclusion or database-level constraints.
3. **VM Environment Restriction**:
   Worker VMs in this project are strictly forbidden from starting product servers, Docker Compose, or PostgreSQL instances (`VM restriction: supervisor/workers may run repository checks, but must not start product development servers, preview/browser test servers, or Docker Compose infrastructure here`).
   Therefore, real PostgreSQL multi-instance concurrency, failure rollback, and database restart acceptance cannot be executed locally on this VM.

`.github/workflows/leave-acceptance.yml` provides the authorized, isolated, GitHub-hosted environment for verifying candidate runtimes against a dedicated migrated PostgreSQL database.

## 2. What the workflow does

`.github/workflows/leave-acceptance.yml` is triggered via `workflow_dispatch` (with a required `candidate_sha` input) and push to the task branch `gemini/sr-leave-be-001-acceptance-runner`:

1. **Candidate SHA Validation & Script Injection Hardening**:
   Validates that `candidate_sha` is a full 40-character hexadecimal SHA (`^[0-9a-f]{40}$`). The input is routed through job-level `env: CANDIDATE_SHA` and read as `$CANDIDATE_SHA` in shell steps rather than interpolated via `${{ }}` inside run scripts, closing script-injection exposure.
2. **Separate Harness SHA Recording**:
   Checks out the harness workspace and records `HARNESS_SHA="$(git rev-parse HEAD)"` to distinguish the acceptance runner harness from the candidate runtime being accepted.
3. **Immutable Candidate Checkout**:
   Fetches and checks out `$CANDIDATE_SHA`. Verifies that `git rev-parse HEAD` strictly equals `$CANDIDATE_SHA`.
4. **Harness Overlay & Runtime Immutability Assertion**:
   Overlays only the harness integration test files (`tests/integration/system-remediation/sr-leave-be-001/`). Executes `git diff --name-only apps/api/src/modules/driver-leave infra/migrations` to assert that no production code or migrations were modified by the overlay.
5. **Dedicated PostGIS Migrated Database**:
   Runs a dedicated `postgis/postgis:16-3.4` service container with health checks. Applies migrations with `pnpm db:migrate` (including `V0094__sr_driver_leave.sql`).
6. **Two-Instance Concurrency & Rollback Test Suite (Phase 1)**:
   Executes `tests/integration/system-remediation/sr-leave-be-001/leave-persistence-race.integration.test.ts` with `--no-file-parallelism --maxConcurrency=1`, capturing full test report and execution logs.
7. **PostgreSQL Container Restart (Durable Reload Verification)**:
   Restarts the dedicated PostgreSQL container (`docker restart`) and waits for `pg_isready`.
8. **Phase 2 Post-Restart Reload**:
   Instantiates fresh repository and service instances to query the reloaded database and verify that leave records, shift annotations, and matching suppressions remain 100% intact without depending on process memory.
9. **Raw SQL Row Evidence Extraction**:
   Extracts actual PostgreSQL rows from:
   - `ops.phase1_driver_leave_requests` -> `.artifacts/leave-acceptance/raw-sql-leaves.txt`
   - `ops.phase1_driver_shifts` -> `.artifacts/leave-acceptance/raw-sql-shifts.txt`
   - `ops.phase1_driver_matching_suppressions` -> `.artifacts/leave-acceptance/raw-sql-suppressions.txt`
10. **Zero-Skip Gate**:
    Gates on the test report: asserts `numTotalTests > 0`, `numPassedTests == numTotalTests`, `numPendingTests == 0`, `numFailedTests == 0`, and `success == true`.
11. **Evidence Upload on Failure & Success**:
    Uploads logs, reports, and raw SQL evidence with `if: always()`, ensuring failing runs leave complete diagnostic traces.

## 3. Integration Test Harness Scope

`tests/integration/system-remediation/sr-leave-be-001/leave-persistence-race.integration.test.ts` exercises:

- **Suite 1: Dedicated PostgreSQL Schema & Baseline Invariants**:
  - Connects to dedicated PostgreSQL database and validates table existence for leave requests, shifts, and matching suppressions.
  - Rejects execution if database is unconfigured or unreachable.
- **Suite 2: Guarded Controller Lifecycle, Permissions & Illegal Transitions**:
  - Driver cross-identity submissions and withdrawals rejected (`LEAVE_FORBIDDEN_ACCESS`, 403).
  - Ops users rejected from withdrawing driver leaves (`LEAVE_FORBIDDEN_ACCESS`, 403).
  - Drivers rejected from reviewing or approving leaves (`LEAVE_FORBIDDEN_ACCESS`, 403).
  - Terminal leaves (approved, rejected, withdrawn) rejected from re-review or re-withdrawal (`LEAVE_INVALID_STATE_TRANSITION`, 409).
- **Suite 3: Concurrent Same-Leave Approve vs Withdraw Across Two Instances**:
  - Two independent `DatabaseService` / `DriverLeaveRepository` / `DriverLeaveService` instances dispatch simultaneous approval and withdrawal.
  - Exactly 1 fulfilled, 1 rejected with 409 CONFLICT (`LEAVE_INVALID_STATE_TRANSITION`).
  - Database row verified: status is either `'approved'` or `'withdrawn'`. If approved, `ops.phase1_driver_matching_suppressions` has active suppression and `ops.phase1_driver_shifts` has `leaveReassigned: true`. If withdrawn, no suppression row exists.
- **Suite 4: Concurrent Overlapping Leave Creation Prevention**:
  - Two simultaneous `createLeave` requests for the same driver with overlapping intervals across two instances: exactly 1 fulfilled, 1 rejected with 409 CONFLICT (`LEAVE_OVERLAPPING_REQUEST`).
  - Raw SQL verifies exactly 1 active leave row in `ops.phase1_driver_leave_requests`.
  - Overlapping leaves for different drivers both succeed.
  - Adjacent non-overlapping intervals (`12:00-15:00` and `15:00-18:00`) for the same driver both succeed.
- **Suite 5: Atomic Rollback on Failure & Fail-Closed Invariants**:
  - Enabled database write rejection throws error and prevents uncommitted save acknowledgment.
  - Transaction rollback during review failure (e.g. suppression insertion failure) preserves leave in `pending` state and touches no shift rows.
- **Suite 6: Durable Reload Verification**:
  - Approved leave, shift reassignment, and active suppression persist across database reload.
  - Brand new repository instance reloads authoritative state directly from PostgreSQL with zero stale memory.

## 4. Structural Contract Test

`tools/ci/test_leave_acceptance_workflow.py` contains 14 unit tests verifying the structural contract of `.github/workflows/leave-acceptance.yml`:
- Workflow exists and declares `workflow_dispatch` with required `candidate_sha` input.
- Narrow push registration for task branch.
- Every job declares `timeout-minutes:`.
- `candidate_sha` validated as 40-character hex string.
- Job-level env routing prevents script injection.
- Checked-out HEAD asserted against candidate SHA.
- Separate `HARNESS_SHA` recorded and overlay preserved.
- Candidate runtime sources asserted immutable.
- Dedicated PostGIS database and migrations applied.
- Integration test path and concurrency limits enforced.
- Container restart step exists.
- Raw SQL extraction queries present.
- Positive test count, all passed, zero skipped gate enforced.
- Always-upload step preserves artifacts.

## 5. Registration in `.github/workflows/ci-integ.yml`

Following the established precedent of commit `ef1fa2332` (`SR-QA-WEBHOOK-001-ACCEPTANCE-RUNNER`) and commit `31f6aa0f1` (`CI-JOB-TIMEOUT-001`), `tools/ci/test_leave_acceptance_workflow.py` was registered in `ci-integ.yml`'s `changes` job:

```yaml
      - name: Verify scope classifier contract
        run: |
          python3 -m unittest tools/ci/test_classify_change_scope.py
          python3 -m unittest tools/ci/test_check_commit_trailers.py
          python3 -m unittest tools/ci/test_check_test_coverage.py
          python3 -m unittest tools/ci/test_workflow_timeouts.py
          python3 -m unittest tools/ci/test_leave_acceptance_workflow.py
      - name: Verify every test file is on a path CI runs
        run: python3 tools/ci/check_test_coverage.py
```

Without this single line, `tools/ci/check_test_coverage.py` would fail on every PR with `test files that yield nothing when CI runs: tools/ci/test_leave_acceptance_workflow.py: on no path CI runs`. With this registration, `python3 tools/ci/check_test_coverage.py` passes cleanly with all 63 test files covered.

## 6. Local Verification

Executed on this worker VM:
```bash
# 1. Structural workflow test
python3 -m unittest tools/ci/test_leave_acceptance_workflow.py -v
# Ran 14 tests in 0.005s — OK

# 2. Workflow timeouts
python3 -m unittest tools/ci/test_workflow_timeouts.py
# Ran 3 tests in 0.010s — OK

# 3. Test coverage reachability
python3 tools/ci/check_test_coverage.py
# check_test_coverage: all 63 test files yield tests CI runs.

# 4. API package typecheck
pnpm --filter @drts/api typecheck
# tsc -p tsconfig.json --noEmit — exit code 0

# 5. Git diff check
git diff --check
# Clean, no whitespace errors
```
