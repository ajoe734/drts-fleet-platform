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
