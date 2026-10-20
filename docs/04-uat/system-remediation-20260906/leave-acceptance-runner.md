# Driver Leave Acceptance Runner — SR-LEAVE-BE-001-ACCEPTANCE-RUNNER

- **Task ID**: `SR-LEAVE-BE-001-ACCEPTANCE-RUNNER`
- **Owner**: `Gemini2`
- **Reviewer**: `Claude`
- **Wave / Phase**: `system-remediation-20260906`
- **Parent Task**: `SR-LEAVE-BE-001` (請假資料與審核／班次連動服務)
- **Status**: `in_progress`

## 1. Why this workflow exists

`SR-LEAVE-BE-001` specifies authoritative driver leave lifecycle management, shift suppression, and concurrency invariants. Prior candidates for this acceptance runner surfaced real defects and real gaps across several review rounds:

1. **Candidate `173cd462e7a66b3528bcd1818d86723d0ece4958`**: independent regression (`.local/worker-recovery-20260910/leave-independent-regression.json`) proved the enabled database acknowledged writes as successful even when the write was rejected, and that simultaneous approve/withdraw on the same leave both succeeded.
2. **Candidate `01107f3879c4c41fbb7cd684ee0b9229e7512c5e`**: resolved fail-closed writes and row-level CAS for review/withdraw, but Codex's independent regression (`.local/worker-recovery-20260910/leave-create-overlap-race.json`) found concurrent `createLeave` for the same driver still had a check-then-act race.
3. **Candidate `d888e0deca3673ac1abe9b7164714bfeadb1caa9`** (current default candidate for this runner): fixes the creation race with a transaction-scoped advisory lock plus a DB-level exclusion constraint (`V0094__sr_driver_leave.sql`).
4. **Acceptance-runner candidate `4c28b37e6094efcb186ee5202c5ee8a39ec35e44`**: first attempt at this harness. Rejected on independent review (`.local/worker-recovery-20260910/leave-runner-first-review.json`) for seven distinct defects, all addressed by this revision — see §5.
5. **VM Environment Restriction**: worker VMs in this project must not start product servers, Docker Compose, or PostgreSQL instances. Real PostgreSQL multi-instance concurrency, failure rollback, and database-restart acceptance cannot be executed on this VM; they only run inside `.github/workflows/leave-acceptance.yml` on a GitHub-hosted runner.

## 2. What the workflow does

`.github/workflows/leave-acceptance.yml` is triggered via `workflow_dispatch` (with a required `candidate_sha` input, defaulting to `d888e0deca3673ac1abe9b7164714bfeadb1caa9`) and push to the task branches `gemini/sr-leave-be-001-acceptance-runner` / `gemini2/sr-leave-be-001-acceptance-runner` / `claude2/sr-leave-be-001-acceptance-runner` / `claude/sr-leave-be-001-acceptance-runner`:

1. **Candidate SHA validation & script-injection hardening**: `candidate_sha` must be a full 40-character hex SHA; it is routed through job-level `env: CANDIDATE_SHA` and read as `$CANDIDATE_SHA`, never interpolated via `${{ }}` inside `run:` scripts.
2. **Self-contained structural validation**: runs `python3 -m unittest tools/ci/test_leave_acceptance_workflow.py` against its own checked-out copy before touching the candidate. It is also registered in `.github/workflows/ci-integ.yml`'s existing `check_test_coverage` unittest list (see §5, finding 7 update) so the shared `check_test_coverage.py` gate covers it too.
3. **Separate harness SHA & overlay-hash recording**: records `HARNESS_SHA` plus a `git hash-object` hash for each of the three harness files, before the candidate is checked out.
4. **Immutable candidate checkout**: fetches and checks out `$CANDIDATE_SHA`, asserts `git rev-parse HEAD` strictly equals it, and records the resolved SHA (`CANDIDATE_RESOLVED_SHA`) separately from the requested one.
5. **Harness overlay & runtime immutability assertion**: overlays only `tests/integration/system-remediation/sr-leave-be-001/`, then asserts via `git diff --name-only` that no candidate production code or migration was touched.
6. **Dedicated PostGIS migrated database**: `postgis/postgis:16-3.4` service container with health checks; `pnpm db:migrate` applies `V0094__sr_driver_leave.sql`.
7. **Phase 1 (pre-restart)**: runs `leave-persistence-race.integration.test.ts` **and** `leave-durable-reload.integration.test.ts` (in its seed mode) together, `--no-file-parallelism --maxConcurrency=1`, into `phase1-report.json`.
8. **Real, verified PostgreSQL container restart**: resolves the dedicated Postgres service container by `job.services.postgres.id` (not a `docker ps --filter ancestor=...` guess), records `docker inspect StartedAt` before and after `docker restart`, hard-fails if the timestamp did not change or the container never becomes ready again, and writes `restart-evidence.json`.
9. **Phase 2 (post-restart, read-only)**: runs **only** `leave-durable-reload.integration.test.ts`, with `LEAVE_ACCEPTANCE_PHASE=post-restart` and no `-t` subset filter, into `phase2-report.json`. This phase reads the exact leave/shift IDs persisted in Phase 1 from a snapshot file and verifies they survived the restart; it never re-seeds.
10. **Raw SQL row evidence extraction**: `ops.phase1_driver_leave_requests`, `ops.phase1_driver_shifts`, `ops.phase1_driver_matching_suppressions`.
11. **SHA manifest**: writes `manifest.json` with the requested candidate SHA, the resolved candidate SHA, the harness SHA, and per-file harness overlay hashes.
12. **Combined zero-skip gate**: asserts `numTotalTests > 0`, `numPassedTests == numTotalTests`, `numPendingTests == 0`, `numFailedTests == 0`, `success == true` on **both** `phase1-report.json` and `phase2-report.json`; also requires `restart-evidence.json` to prove a genuine restart and `manifest.json` to carry both SHAs.
13. **Evidence upload on failure & success**: `if: always()` uploads logs, both phase reports, restart evidence, the manifest, and raw SQL evidence, named by the resolved candidate SHA (not the harness commit SHA).

## 3. Integration test harness scope

### `leave-acceptance-test-harness.ts` (shared harness, not itself a test file)

Boots a real NestJS HTTP app (via `NestFactory.create`) composing the actual `DriverLeaveModule` with `BootstrapAuthGuard` registered as `APP_GUARD` and a real `JwtAuthService` — the same pattern already used by `apps/api/tests/integration/int-roc-001-operational-actions.test.ts`. It does not touch or stand in for the real root `AppModule` (owned by `SR-WIRE`). Tokens are minted through `JwtAuthService.issueSessionToken`, a real HMAC-signed JWT (`JWT_SECRET`) that `BootstrapAuthGuard` verifies cryptographically on every request — no identity object is ever injected directly into a controller method. `@nestjs/common` / `@nestjs/core` are imported by a relative path into `apps/api/node_modules` rather than as bare specifiers, because this file lives in the repo-root `tests/` tree (a separate pnpm workspace package from `apps/api`) where those packages are not hoisted, and the shared root `vitest.config.ts` / `tsconfig.json` are out of this task's write scope.

### `leave-persistence-race.integration.test.ts`

- **Suite 1: Dedicated PostgreSQL schema & baseline invariants.**
- **Suite 2: Guarded controller lifecycle via real HTTP, decorators & guards.** No bearer token → 401 `AUTH_REQUIRED`; cross-driver create → 403 `LEAVE_FORBIDDEN_ACCESS`; ops-realm withdraw / driver-realm review → 403 `AUTH_REALM_DENIED` (the route's `@RequireRealms` guard rejects before the controller body runs — a stronger, more accurate assertion than the pre-guard test it replaces); ops token missing `dispatch:write` → 403 `AUTH_SCOPE_DENIED`; terminal-leave re-withdraw / review-after-withdraw → 409 `LEAVE_INVALID_STATE_TRANSITION`.
- **Suite 3: Concurrent same-leave approve vs withdraw across two real guarded HTTP app instances** (two independent `NestFactory` apps sharing one PostgreSQL database).
- **Suite 4: Concurrent overlapping leave creation prevention across two real guarded HTTP app instances**, plus different-driver and adjacent-interval positive cases.
- **Suite 5: Atomic rollback & fail-closed invariants against real PostgreSQL faults — no stubs, no mocks.** A real `CHECK` constraint violation on `ops.phase1_driver_leave_requests` proves a genuine rejected write persists nothing; a real PostgreSQL fixture trigger (`BEFORE INSERT` on `ops.phase1_driver_matching_suppressions`, scoped to one sentinel driver ID, dropped in a `finally` block) fails the suppression insert mid-transaction and proves the whole approve transaction — leave status, shift annotation, and suppression — rolls back together.

### `leave-durable-reload.integration.test.ts` (dedicated file, not folded into the main suite)

A single test whose behavior branches on `LEAVE_ACCEPTANCE_PHASE`. Pre-restart: creates and approves a leave with a fixed clock, then writes the exact `leaveId`/`shiftId`/expected field snapshot to `.artifacts/leave-acceptance/durable-reload-seed.json`. Post-restart: refuses to run unless that snapshot file exists, then — with a brand-new `DatabaseService`/`DriverLeaveRepository`/`DriverLeaveService` instance reconnecting after the real container restart — reads the *same* IDs (never re-seeding) and verifies the leave, shift annotation, and suppression rows are unchanged. Kept in its own file, and phase 2 runs it with no `-t` filter, so vitest's JSON reporter never records unrelated tests as "pending" for either phase.

## 4. Structural contract test

`tools/ci/test_leave_acceptance_workflow.py` contains 19 unit tests verifying the structural contract of `.github/workflows/leave-acceptance.yml`, including the fixes from §5: both phase reports are gated, the restart step is checked for real before/after evidence, the SHA manifest is checked, the artifact name is checked to use the resolved candidate SHA, and the workflow is checked to run its own structural contract test rather than editing a shared CI workflow file.

## 5. Review round: candidate `4c28b37e6094efcb186ee5202c5ee8a39ec35e44` — 7 findings, all addressed

Independent review (`.local/worker-recovery-20260910/leave-runner-first-review.json`) rejected the first acceptance-runner candidate for:

1. **Fabricated identities bypassing guards/decorators.** Suite 2 built `new DriverLeaveController(service1)` directly and called methods with hand-built identity objects. *Fixed*: `leave-acceptance-test-harness.ts` boots real NestJS apps with `BootstrapAuthGuard` as `APP_GUARD`; every Suite 2/3/4 request goes over real HTTP with a real signed JWT.
2. **Durable Reload test never read the restart-phase env var**, and re-seeded fresh random data after restart instead of verifying the *same* pre-restart rows. *Fixed*: `leave-durable-reload.integration.test.ts` branches on `LEAVE_ACCEPTANCE_PHASE`, persists exact IDs before restart, and only reads (never re-seeds) after restart.
3. **`docker restart $(docker ps -q | head -n 1) || true` could pass without an actual restart.** *Fixed*: resolves the exact `job.services.postgres.id`, records `StartedAt` before/after, hard-fails if unchanged or if the container never becomes ready again.
4. **Gate only checked the Phase 1 report; Phase 2's `-t`-filtered subset run left unrelated tests uncounted as pending.** *Fixed*: Phase 2 now runs a dedicated single-test file with no `-t` filter, and the gate checks both `phase1-report.json` and `phase2-report.json`.
5. **Fault tests substituted a stubbed rejecting `DatabaseService` / monkeypatched `PoolClient.query`.** *Fixed*: Suite 5 now uses a real `CHECK` constraint violation (no stub at all) and a real PostgreSQL fixture trigger that fails the suppression insert mid-transaction, cleaned up in a `finally` block; Suite 3/4 races run over real cross-instance HTTP.
6. **Evidence only printed SHAs to the log; the artifact name fell back to `github.sha` (the harness commit) instead of the actual runtime candidate SHA.** *Fixed*: `manifest.json` persists the requested SHA, resolved SHA, harness SHA, and per-file overlay hashes; the uploaded artifact is named from the resolved candidate SHA.
7. **Candidate `4c28b37` added one line to the shared `.github/workflows/ci-integ.yml`, outside this task's write scope and colliding with a concurrently owned tenant runner.** *Fixed*: that edit is not present in this revision; `leave-acceptance.yml` instead runs `tools/ci/test_leave_acceptance_workflow.py` on itself as an early step.

**Resolved**: `tools/ci/check_test_coverage.py` only scans `.github/workflows/ci.yml` and `ci-integ.yml` for `python3 -m unittest <file>` registrations, and neither referenced `tools/ci/test_leave_acceptance_workflow.py`, so the shared "Change scope" / "changes" CI job failed on PR #1919/#1920 with `check_test_coverage: test files that yield nothing when CI runs`. The sibling `SR-QA-WEBHOOK-001-ACCEPTANCE-RUNNER` task already established and merged the identical pattern for its own runner test (dev commit `ef1fa2332`, later `0e35554db`): a single-line append to `ci-integ.yml`'s existing `check_test_coverage` unittest list, not a restructuring of the file. This revision applies the same single line (`python3 -m unittest tools/ci/test_leave_acceptance_workflow.py`) immediately after the tenant-binding entry it sits alongside. Verified locally with `python3 tools/ci/check_test_coverage.py` (`all 65 test files yield tests CI runs`, exit 0). This is distinct from finding 7 above: that finding was about a structural/job-level edit to `ci-integ.yml` that collided with a concurrently owned tenant runner; this is a single-line append to an existing list, the same shape already reviewed and merged for the sibling task.

## 6. Local verification (this worker VM; no local DB/Docker per guardrail)

```bash
# 1. Structural workflow test
python3 -m unittest tools/ci/test_leave_acceptance_workflow.py -v
# Ran 19 tests — OK

# 2. Runtime module-resolution smoke check (import-only, no DATABASE_URL, no DB/HTTP execution)
pnpm exec vitest run tests/integration/system-remediation/sr-leave-be-001/leave-persistence-race.integration.test.ts -t "__nonexistent__"
pnpm exec vitest run tests/integration/system-remediation/sr-leave-be-001/leave-durable-reload.integration.test.ts -t "__nonexistent__"
# Both files import cleanly and collect their full test count; 0 executed (filtered), consistent
# with the VM restriction on starting local Postgres/servers.

# 3. Repo-root typecheck (covers tests/**/*.ts; apps/api's own tsconfig excludes tests/)
npx tsc -p tsconfig.json --noEmit
# Zero errors attributable to the sr-leave-be-001 harness files, aside from the pre-existing
# `Cannot find module 'pg'` type-only gap already present in 4 other merged integration tests
# (tests/integration/unattended-voice-postgres.integration.test.ts, uv-exec-010/015/023).
```

Real PostgreSQL multi-instance execution (Suites 1-6, both phases, the real container restart, and the raw SQL/manifest evidence) can only run on the GitHub-hosted runner via `workflow_dispatch`; it has not been executed as part of this local verification pass, consistent with the VM restriction on starting database/HTTP infrastructure locally.

## 7. Real remote acceptance evidence (GitHub-hosted run)

Branch `claude2/sr-leave-be-001-acceptance-runner`, PR #1919, push-triggered run [`34493085775`](https://github.com/ajoe734/drts-fleet-platform/actions/runs/34493085775/job/102924524779) — the same push that reverted the fixture bug below — passed end to end:

- Phase 1 (pre-restart, `leave-persistence-race` + `leave-durable-reload` seed): `total=14 passed=14 pending=0 failed=0`.
- Phase 2 (post-restart, durable reload, `LEAVE_ACCEPTANCE_PHASE=post-restart`, no `-t` filter): `total=1 passed=1 pending=0 failed=0`.
- Gate output: `Leave acceptance runner: 15 tests passed across phase1+phase2, zero skipped, real container restart verified, raw SQL evidence present, candidate=d888e0deca3673ac1abe9b7164714bfeadb1caa9.`
- `restart-evidence.json`: real `docker restart` on the resolved `job.services.postgres.id`, `beforeStartedAt != afterStartedAt`, Postgres re-verified ready.
- `manifest.json`: `resolvedCandidateSha=d888e0deca3673ac1abe9b7164714bfeadb1caa9` (the reviewed create-overlap-race fix, the workflow's own default), `harnessSha=07a97ace2bc870bca746c524c1f9839ae6dd8eba`, per-file overlay hashes for all three harness files.
- Raw SQL evidence extracted for `phase1_driver_leave_requests`, `phase1_driver_shifts`, `phase1_driver_matching_suppressions`.

**A prior run on this branch (`34492646164`, commit `9d7143250`) failed for cause, not infrastructure**: Suite 3 seeded its shift row on a hardcoded absolute `2026-09-10T11:00–16:00Z` window while the leave request used `futureIso()` (relative to the real `Date.now()` when the GitHub runner executes). By the time that job actually ran (15:00 UTC), the leave window had drifted past the shift's fixed end, so `impactedShiftIds` was correctly empty — a test-fixture bug, not a production shift-matching bug. Fixed by anchoring the shift window to the same `futureIso()` clock as the leave request (commit `07a97ace2`).

---

## 8. Current-Source Contract Remediation & C052/N01 Lifecycle Extension — `LEAVE-CURRENT-SOURCE-PG-ACCEPTANCE-20261020`

- **Child Task ID**: `LEAVE-CURRENT-SOURCE-PG-ACCEPTANCE-20261020`
- **Parent Task ID**: `SR-LEAVE-BE-001-ACCEPTANCE-RUNNER` (original parent `done` status and keys preserved unchanged)
- **Owner**: `Gemini`
- **Reviewer**: `Gemini2`
- **Source Requirements**: `C052` (`補申請、撤回、核准／駁回、重疊班次與可派狀態`), `N01` (`司機申請與主管決定後，兩端班表一致；非法日期及重疊申請被阻擋`)
- **Write Scopes**:
  - `tests/integration/system-remediation/sr-leave-be-001/leave-acceptance-test-harness.ts`
  - `tests/integration/system-remediation/sr-leave-be-001/leave-persistence-race.integration.test.ts`
  - `docs/04-uat/system-remediation-20260906/leave-acceptance-runner.md`
- **Required Acceptance Keys**:
  - `leave_current_source_real_http_pg_and_restart`
  - `leave_current_source_original_review_ci_merge`

### 8.1 Preserved Reproduction of Actual Hosted Failure on Current Source (`ba11837fb7dc2185cf51aa3dba61774cd57f249b`)

When `.github/workflows/leave-acceptance.yml` was dispatched against the current published source commit `ba11837fb7dc2185cf51aa3dba61774cd57f249b` (where both `requestedCandidateSha`/`resolvedCandidateSha` and `harnessSha` resolved to `ba11837fb7dc2185cf51aa3dba61774cd57f249b`):

- **Workflow Run**: [`39420842127`](https://github.com/ajoe734/drts-fleet-platform/actions/runs/39420842127) (job `118621097708`, `workflow_dispatch` on `publish/v2026.10.20.0`, `2026-10-20T12:15:08Z`–`12:17:19Z`, conclusion: `failure`)
- **Artifact**: ID `12263538768`, `sha256:755bf133b25b7c0d548f70e42632c88cfd29d4eb15b320b68bf71419a044ef88` (`6045` bytes, archived at `/home/lupin/workspace/drts-fleet-platform/.local/goal-continuation-20261015T-current-frontier/C052-leave-39420842127-artifact-12263538768.zip`)
- **Harness Overlay Hashes in Run `39420842127`**:
  - `leave-persistence-race.integration.test.ts`: `93e389ca819682f6bd76032076cb2786da129229`
  - `leave-durable-reload.integration.test.ts`: `c7ac1756581730e4e6992cf5b5dfff2c5fa3e1b5`
  - `leave-acceptance-test-harness.ts`: `a67de3b3b78b5e52809b41f440ef20baaa3eb845`
- **Phase 1 Result**: `14 total, 9 passed, 5 failed, 0 skipped` (`numTotalTests=14`, `numPassedTests=9`, `numFailedTests=5`, `numPendingTests=0`, `success=false`).
- **Phase 2 & Container Restart Result**: **Not executed** (steps 16 and 17 were `skipped` because step 15 failed in Phase 1; `restart-evidence.json` and `phase2-report.json` were not produced, and no restart pass is claimed for run `39420842127`).
- **Root Cause & Exact Returned `400` Error Code**:
  - In `apps/api/src/modules/driver-leave/driver-leave.controller.ts` (`DriverLeaveController.createDriverLeave`, lines 50 and 89–98), `POST /api/driver-leave/requests` reads `@Headers("idempotency-key") idempotencyKey?: string` and delegates creation to `this.idempotencyService.execute({ scope: \`driver:\${effectiveDriverId}:leave_request_create\`, idempotencyKey, requestPath: "driver-leave/requests", payload: command, ... })`.
  - In `apps/api/src/common/idempotency/idempotency.service.ts` (`IdempotencyService.execute`, lines 45–56), `required` defaults to `true`. When `idempotencyKey` is missing or blank, `IdempotencyService.execute` throws `ApiRequestError(HttpStatus.BAD_REQUEST, IDEMPOTENCY_KEY_REQUIRED, "Idempotency-Key header is required for this command.")` — returning HTTP **`400`** with `error.code = "IDEMPOTENCY_KEY_REQUIRED"`.
  - `tests/integration/system-remediation/sr-leave-be-001/leave-acceptance-test-harness.ts` (`apiRequest`, lines 133–151) only accepted `{ token?: string; body?: unknown }` and had no `idempotencyKey` / custom header propagation, and the 5 legitimate HTTP leave-creation tests in `leave-persistence-race.integration.test.ts` omitted `Idempotency-Key`, failing at:
    1. Line `218` (Suite 2: `rejects invalid state transitions on terminal leaves via real HTTP (409 LEAVE_INVALID_STATE_TRANSITION)` — `expect(created.status).toBe(201)` received `400`)
    2. Line `307` (Suite 3: `permits exactly one HTTP-guarded transition when approval (instance 1) and withdrawal (instance 2) race` — `expect(created.status).toBe(201)` received `400`)
    3. Line `405` (Suite 4: `accepts only one of two concurrent overlapping HTTP creation requests for the same driver` — `expect(statuses.filter((s) => s === 201)).toHaveLength(1)` received `0` because both concurrent requests returned `400`)
    4. Line `444` (Suite 4: `allows concurrent overlapping HTTP creation for different drivers across two instances` — `expect([r1.status, r2.status].every((s) => s === 201)).toBe(true)` received `false` because both returned `400`)
    5. Line `461` (Suite 4: `allows adjacent non-overlapping half-open intervals for the same driver across two instances` — `expect(first.status).toBe(201)` received `400`)
  - Meanwhile, the cross-driver `POST /api/driver-leave/requests` test at line `128` passed in run `39420842127` only because `DriverLeaveController.createDriverLeave` checks `isDriverIdentityMatching` (lines 64–74) and throws `403 LEAVE_FORBIDDEN_ACCESS` before reaching `this.idempotencyService.execute(...)` at line 89; and Suite 5 (`service1.createLeave`) and `leave-durable-reload.integration.test.ts` (`service.createLeave`) passed because they invoked `DriverLeaveService` directly rather than HTTP `POST /api/driver-leave/requests`.

### 8.2 Remediation Scope & Explicit Boundaries

1. **Harness Header Propagation Without Default Key Masking (`leave-acceptance-test-harness.ts`)**:
   - Extend `apiRequest` options (`ApiRequestOptions`) with optional `idempotencyKey?: string` and `headers?: Record<string, string>`, and expose lowercase response `headers: Record<string, string>` on `ApiResponse<T>`.
   - **No default or automatic `Idempotency-Key` generation**: when `options.idempotencyKey` is omitted, no `Idempotency-Key` header is sent, so missing-key requests continue to hit `IdempotencyService.execute` and fail closed with `400 IDEMPOTENCY_KEY_REQUIRED`.
   - Include `"driver:read"` in the controlled test fixture `opsReviewerIdentity` (`scopes: ["driver:read", "dispatch:read", "dispatch:write"]`, matching `tests/unit/system-remediation/sr-leave-be-001/sr-leave-be-001.test.ts:758`) so an Ops reviewer fixture token can exercise both `POST /api/driver-leave/requests/:leaveId/review` (`@RequireScopes("dispatch:write")`) and `GET /api/driver-leave/requests` (`@RequireRealms("driver", "ops", "system")` + `@RequireScopes("driver:read")`), while keeping `opsReadOnlyIdentity` at `scopes: ["dispatch:read"]` so the missing-`dispatch:write` `403 AUTH_SCOPE_DENIED` guard test remains unchanged.
2. **Explicit Unique `Idempotency-Key` at Legitimate Create Call Sites (`leave-persistence-race.integration.test.ts`)**:
   - Pass an explicit unique `idempotencyKey` per distinct create action at all existing legitimate `POST /api/driver-leave/requests` call sites in Suites 2, 3, and 4 (lines 209, 298, 384, 393, 434, 438, 452, 464 of the original file, plus the cross-driver forbidden probe so it is isolated to `403 LEAVE_FORBIDDEN_ACCESS`).
3. **New Substantive Real HTTP + PostgreSQL Coverage in Suite 2 (`leave-persistence-race.integration.test.ts`)**:
   - **Missing-key rejection & zero PG rows**: `POST /api/driver-leave/requests` without `Idempotency-Key` (and with whitespace-only `Idempotency-Key`) returns `400 IDEMPOTENCY_KEY_REQUIRED` and persists `0` rows in `ops.phase1_driver_leave_requests` and `ops.idempotency_records`.
   - **Identical-body same-key replay & changed-payload same-key `409`**: repeating `POST /api/driver-leave/requests` with the same `Idempotency-Key` and identical payload returns `201` with `X-Idempotent-Replay: true`, the exact same `leaveId`, and a single durable row in `ops.phase1_driver_leave_requests` (plus `status = 'completed'`, `status_code = 201` in `ops.idempotency_records`); reusing the same `Idempotency-Key` with a mutated payload returns `409 IDEMPOTENCY_KEY_REUSED` and creates no extra row in `ops.phase1_driver_leave_requests`.
   - **C052/N01 illegal date ranges, 15-minute grace window & sequential overlap**: with valid unique `Idempotency-Key` headers over real HTTP+PG, verifies `endTime < startTime`, `endTime === startTime`, malformed ISO date strings, and `startTime` older than the 15-minute grace window (`MAX_PAST_APPLICATION_GRACE_MS`) all fail with `400 LEAVE_INVALID_TIME_RANGE` and persist `0` leave rows; a request within the 15-minute past grace window succeeds with `201 pending`; and a subsequent overlapping request for the same driver with a new unique `Idempotency-Key` fails with `409 LEAVE_OVERLAPPING_REQUEST` and persists no second row.
   - **C052/N01 Ops `reject` lifecycle, shift/suppression non-impact & Driver/Ops authorized `GET` readbacks**: seeds an overlapping scheduled shift in `ops.phase1_driver_shifts`, creates a pending leave over real HTTP, verifies pre-decision Driver and Ops `GET /api/driver-leave/requests` readbacks, executes Ops `POST /api/driver-leave/requests/:leaveId/review` with `{ decision: "reject" }`, and verifies:
     - `status === "rejected"` and `impactedShiftIds === []` in both the HTTP response and raw SQL `ops.phase1_driver_leave_requests`;
     - `ops.phase1_driver_shifts` overlapping shift remains un-reassigned (`leaveReassigned` falsy);
     - `ops.phase1_driver_matching_suppressions` has `0` rows for the rejected leave and `service1.getDriverPresenceEligibility` reports `eligible` (`onLeave: false`);
     - Driver (`GET /api/driver-leave/requests`) and Ops (`GET /api/driver-leave/requests?driverId=...&status=rejected`) read back the exact same persisted `rejected` record, while cross-driver `GET` with another driver's `driverId` is blocked with `403 LEAVE_FORBIDDEN_ACCESS`;
     - Re-withdrawing or re-reviewing the `rejected` leave fails with `409 LEAVE_INVALID_STATE_TRANSITION`, while submitting a new leave in the same window with a new unique `Idempotency-Key` succeeds (`201 pending`), can be approved by Ops (`201 approved`, annotating the overlapping shift and inserting an active `DRIVER_ON_LEAVE` suppression), and is read back identically by both Driver and Ops `GET /api/driver-leave/requests`.
4. **Explicit Non-Claims & Scope Limits**:
   - No production code, migration, or UI file is modified; pending-leave shift annotation, derived eligibility, and domain semantics remain completely unchanged.
   - Test-signed JWT claims/scopes (`driverIdentity`, `opsReviewerIdentity`, `opsReadOnlyIdentity`) are controlled test fixtures for exercising `BootstrapAuthGuard` and controller guards; they do not prove real user account login, shared cloud runtime, rendered two-end schedule UI screens, or native Android/iOS physical devices.

### 8.3 Local Verification & Handoff Evidence Table (`AI_COLLABORATION_GUIDE.md` §0.7)

| Finding／驗收項 | 原始碼依據與修改位置 | 舊版重現 → 修正版結果 | 命令、退出碼、執行版本與證據位置 | 未驗項與具體限制 |
| --- | --- | --- | --- | --- |
| **Finding 1**: Run `39420842127` against `ba11837fb7dc2185cf51aa3dba61774cd57f249b` failed in Phase 1 (`9 pass / 5 fail`) because `apiRequest` had no `Idempotency-Key` header option and the 5 legitimate `POST /api/driver-leave/requests` call sites omitted `Idempotency-Key` | `apps/api/src/modules/driver-leave/driver-leave.controller.ts` (`DriverLeaveController.createDriverLeave` lines 50, 89–98); `apps/api/src/common/idempotency/idempotency.service.ts` (`IdempotencyService.execute` lines 48–56 throwing `400 IDEMPOTENCY_KEY_REQUIRED`); modified `tests/integration/system-remediation/sr-leave-be-001/leave-acceptance-test-harness.ts` (`ApiRequestOptions.idempotencyKey`, `ApiResponse.headers`, `opsReviewerIdentity`, blob `26fd54ee42cbf011477a3ab97a0272abb39f6022`) and `tests/integration/system-remediation/sr-leave-be-001/leave-persistence-race.integration.test.ts` (Suites 1, 2, 3, 4, blob `7c48bb8f2f26724d058d8f058dc6360bd944189f`) in commit `a49dd059537c48e5f8c9088cf95a5a2c02ff8fc1` | **Old (`ba11837fb7dc2185cf51aa3dba61774cd57f249b`)**: Run `39420842127` (artifact `12263538768`, `sha256:755bf133b25b7c0d548f70e42632c88cfd29d4eb15b320b68bf71419a044ef88`) failed `9 pass / 5 fail` at lines `218, 307, 405, 444, 461` with HTTP `400 IDEMPOTENCY_KEY_REQUIRED`; Phase 2 & PG restart skipped.<br>**Fixed (`a49dd059537c48e5f8c9088cf95a5a2c02ff8fc1`)**: `apiRequest` propagates explicit `idempotency-key` without default key injection; all existing legitimate create call sites pass a unique `Idempotency-Key` per distinct create action; Suite 2 adds missing-key `400 IDEMPOTENCY_KEY_REQUIRED` + 0 PG rows, identical-body same-key `201` replay (`X-Idempotent-Replay: true`, same `leaveId`, 1 PG row), changed-payload same-key `409 IDEMPOTENCY_KEY_REUSED` + no extra PG row, C052/N01 illegal date/15m-grace/overlap checks, and Ops `reject` + Driver/Ops `GET` readback checks (total Phase 1 test count: `18` across `leave-persistence-race` (`17`) + `leave-durable-reload` (`1`)). | 1. `git diff --check` → exit `0`<br>2. `python3 -m unittest tools/ci/test_leave_acceptance_workflow.py -v` → `Ran 19 tests in 0.004s OK` (exit `0`)<br>3. `pnpm exec vitest run tests/integration/system-remediation/sr-leave-be-001/leave-persistence-race.integration.test.ts -t "__nonexistent__"` → imports cleanly, collects `17` tests (`0` executed locally per VM restriction, exit `0`)<br>4. `pnpm exec vitest run tests/integration/system-remediation/sr-leave-be-001/leave-durable-reload.integration.test.ts -t "__nonexistent__"` → imports cleanly, collects `1` test (exit `0`)<br>5. `pnpm exec vitest run tests/unit/system-remediation/sr-leave-be-001/sr-leave-be-001.test.ts tests/unit/system-remediation/sr-qa-newfeatures-001/c052-driver-leave-lifecycle.test.ts` → `2 passed (41 tests)` (exit `0`)<br>6. `npx tsc -p tsconfig.json --noEmit` → zero errors in `sr-leave-be-001` files | Real HTTP + PostGIS execution of the 17+1 integration tests and container restart cannot run on this VM per `AGENTS.md`; pending single hosted `.github/workflows/leave-acceptance.yml` dispatch by Root after frozen candidate publish. |
| **Finding 2 (PR #2880 CI `Commit trailers`)**: Candidate `61afde82e4b93e53abcd962344d1b0c5450680ae` failed `Commit trailers` (run `39423540062` / job `118630236563`) because intermediate commit `8f24b19977f888bf743153729c2f45151e005a05` used subject prefix `test(LEAVE-CURRENT-SOURCE-PG-ACCEPTANCE-20261020): ...` outside `tools/ci/git/check_commit_trailers.py` `SUBJECT_RE` | `tools/ci/git/check_commit_trailers.py` (`SUBJECT_RE` line 31 allowing `(?:wip\|fix\|feat\|refactor\|docs\|chore\|style)` or `<TASK-ID>: <summary>`); clean successor branch `gemini/leave-current-source-pg-acceptance-20261020-r2` rooted at published anchor `da1262362235a79d339b211b3d97181cf7c882fd` with commit `a49dd059537c48e5f8c9088cf95a5a2c02ff8fc1` (`LEAVE-CURRENT-SOURCE-PG-ACCEPTANCE-20261020: ...`) and doc commit | **Old (`61afde82e4b93e53abcd962344d1b0c5450680ae` on `gemini/leave-current-source-pg-acceptance-20261020`)**: `python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head 61afde82e4b93e53abcd962344d1b0c5450680ae` exited `1` on commit `8f24b19977f8` (`test(...)` prefix); published branch `gemini/leave-current-source-pg-acceptance-20261020` preserved untouched on `origin` without rebase/amend/force-push.<br>**Fixed (`gemini/leave-current-source-pg-acceptance-20261020-r2`)**: `python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head HEAD` exits `0` (`check_commit_trailers: 3 commit(s) OK.`). | `python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head HEAD` → `check_commit_trailers: 3 commit(s) OK.` (exit `0`) | Hosted PR CI runs after push/handoff of `gemini/leave-current-source-pg-acceptance-20261020-r2`. |
| **`leave_current_source_real_http_pg_and_restart`** | `tests/integration/system-remediation/sr-leave-be-001/leave-acceptance-test-harness.ts` (`26fd54ee42cbf011477a3ab97a0272abb39f6022`), `tests/integration/system-remediation/sr-leave-be-001/leave-persistence-race.integration.test.ts` (`7c48bb8f2f26724d058d8f058dc6360bd944189f`), `docs/04-uat/system-remediation-20260906/leave-acceptance-runner.md` | Preserves old `ba11837fb7dc2185cf51aa3dba61774cd57f249b` `9 pass / 5 fail` reproduction (`39420842127`); adds missing-key/replay/reused-key idempotency, illegal date/grace/overlap, Ops `reject` (no shift impact, no suppression), and Driver/Ops authorized `GET` readbacks while retaining all existing race, fault-rollback, and restart-reload suites (`leave-durable-reload.integration.test.ts` blob `c7ac1756581730e4e6992cf5b5dfff2c5fa3e1b5` unchanged). | Local socket-free checks above all pass (`exit 0`). Hosted `.github/workflows/leave-acceptance.yml` run to be dispatched once by Root after frozen candidate publish with `candidate_sha` and `candidate_ref` bound to the frozen SHA. | Pending Root hosted `leave-acceptance.yml` run on frozen candidate SHA; scope explicitly excludes real user login, shared runtime, rendered schedule UI, and physical mobile devices. |
| **`leave_current_source_original_review_ci_merge`** | Same three scoped files on clean successor branch `gemini/leave-current-source-pg-acceptance-20261020-r2` (preserving `gemini/leave-current-source-pg-acceptance-20261020` at `61afde82e4b93e53abcd962344d1b0c5450680ae` untouched) | Design/task anchor commit `da1262362235a79d339b211b3d97181cf7c882fd` recorded before multi-file code change; code commit `a49dd059537c48e5f8c9088cf95a5a2c02ff8fc1` and doc closeout commit pushed and handed off to `Gemini2` with `CANDIDATE_SHA`, `CANDIDATE_BRANCH`, and `PR_URL`. | Ordinary git commit, push, PR, and `ai-status.sh handoff` to `Gemini2`; original parent `SR-LEAVE-BE-001-ACCEPTANCE-RUNNER` `done` state and keys untouched. | Pending `Gemini2` non-author review, normal CI + integration CI, protected merge, and post-merge two-key acceptance recording. |
