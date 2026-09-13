# SR-API-THROTTLE-BASELINE-20260911 — API Throttle Alignment to SLA Baseline & Dispatch 409 Conflict Remediation

Owner: `Gemini`
Reviewer: `Gemini2`
Date: 2026-09-13 UTC

## 1. Traceability & Context

- **Task ID**: `SR-API-THROTTLE-BASELINE-20260911`
- **Branch**: `gemini/sr-api-throttle-baseline-20260911`
- **Worktree**: `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-api-throttle-baseline-20260911`
- **Base SHA**: `89f4350854460f77eec821f5dfaa8ca2221b61b8` (`origin/dev`)
- **SLA Baseline Document**: `docs/02-architecture/phase1-operational-workload-sla-degradation-baseline-20260430.md`
- **Reference Acceptance Runner**: `docs/04-uat/system-remediation-20260906/ops-capacity-acceptance-runner.md`
- **Parent / Related Work**: `SR-OPS-CAPACITY-RUNNER-20260911` (run 34581509135 on merge 5aaf95218)

---

## 2. Root Cause Analysis (RCA)

### 2.1 HTTP 429 Failures (Rate Limit Lockout)

In run 34581509135 under the full 900-second burst load:
- Booking requests exhibited a 79.6% failure rate (HTTP 429).
- Dispatch requests exhibited a 100% failure rate (zero successful completions).
- Report generation jobs exhibited a 33.6% failure rate (HTTP 429).

**Root Cause**:
1. `apps/api/src/app.module.ts` registered `ThrottlerModule.forRoot([...GLOBAL_RATE_LIMIT])` with default settings (`limit: 60`, `ttl: minutes(1)`, `blockDuration: minutes(5)`).
2. The controller endpoints for `POST tenant/bookings`, `POST orders/:orderId/dispatch`, and `POST reports/jobs` did not have route-level `@Throttle` decorator overrides.
3. As a result, all three endpoints inherited the global 60 requests/minute rule and the punitive 5-minute (`300,000ms`) lockout:
   - The dispatch workload required 300 requests/minute (5 req/sec). In the first minute, the 60-request limit was exceeded in just 12 seconds.
   - Once exceeded (`totalHits > limit`), NestJS Throttler set `isBlocked = true` for the actor key for 5 minutes (`blockDuration`).
   - Any further requests from that actor (including across routes sharing the same tenant/actor bucket) were unconditionally rejected with HTTP 429 for 300 seconds.

**Remediation**:
- Defined explicit rate limit constants in `apps/api/src/common/throttling/rate-limit.constants.ts`:
  - `BOOKING_INTAKE_RATE_LIMIT`: `limit: 60`, `ttl: minutes(1)`, `blockDuration: seconds(1)`
  - `DISPATCH_RATE_LIMIT`: `limit: 300`, `ttl: minutes(1)`, `blockDuration: seconds(1)`
  - `REPORT_JOBS_RATE_LIMIT`: `limit: 30`, `ttl: minutes(1)`, `blockDuration: seconds(1)`
- Decorated `createTenantBooking` in `apps/api/src/modules/owned-mobility/owned-mobility.controller.ts` with `@Throttle(BOOKING_INTAKE_RATE_LIMIT)`.
- Decorated `dispatchOrder` in `apps/api/src/modules/owned-mobility/owned-mobility.controller.ts` with `@Throttle(DISPATCH_RATE_LIMIT)`.
- Decorated `createReportJob` in `apps/api/src/modules/reporting-filing/reporting-filing.controller.ts` with `@Throttle(REPORT_JOBS_RATE_LIMIT)`.
- Setting `blockDuration: seconds(1)` ensures that any temporary throttle condition does not impose a 5-minute cascading block across unrelated calls.

### 2.2 HTTP 409 Conflict (Dispatch Compliance Gate Rejection)

In run 34581509135, exactly 180 dispatch requests failed with HTTP 409 (these were the requests that passed the throttler in windows 1, 2, and 3 before being blocked).

**Root Cause**:
1. `prepareDispatchOrder` in `owned-mobility.service.ts` calls `assertDispatchComplianceGatesClear(order)`.
2. The pre-seeded dispatchable orders created in `ops-capacity-acceptance.test.ts` (`seedWorker`) only specified text addresses for `pickup` and `dropoff` (e.g. `pickup: { address: "SR-OPS-CAPACITY seed pickup ..." }`), omitting `lat` and `lng`.
3. Without coordinates, `toServiceAreaPoint` evaluated to `null`, causing the service area compliance gate to fail with:
   - `state: "review_required"`
   - `missingItems: ["pickup_coordinates", "dropoff_coordinates"]`
4. `assertDispatchComplianceGatesClear` detected that the `service_area` gate was not `clear` and threw an `ApiRequestError(HttpStatus.CONFLICT, "DISPATCH_REQUIRES_MANUAL_REVIEW")` (HTTP 409).

**Remediation**:
- Updated `seedWorker` order generation in `tests/integration/system-remediation/sr-ops-capacity-20260911/ops-capacity-acceptance.test.ts` to include valid Taipei Core coordinates:
  - Pickup: `lat: 25.042, lng: 121.552`
  - Dropoff: `lat: 25.045, lng: 121.555`
- This allows `toServiceAreaPoint` to resolve correctly against the active `TAIPEI_CORE` boundary, ensuring the `service_area` gate evaluates to `state: "clear"`, resolving the 409 conflict.

---

## 3. Implementation Summary

1. `apps/api/src/common/throttling/rate-limit.constants.ts`:
   - Added `BOOKING_INTAKE_RATE_LIMIT` (60/min, blockDuration 1s)
   - Added `DISPATCH_RATE_LIMIT` (300/min, blockDuration 1s)
   - Added `REPORT_JOBS_RATE_LIMIT` (30/min, blockDuration 1s)
   - Exported aliases `BOOKING_RATE_LIMIT` and `REPORTING_RATE_LIMIT`
2. `apps/api/src/modules/owned-mobility/owned-mobility.controller.ts`:
   - `@Throttle(BOOKING_INTAKE_RATE_LIMIT)` on `POST tenant/bookings` (`createTenantBooking`)
   - `@Throttle(DISPATCH_RATE_LIMIT)` on `POST orders/:orderId/dispatch` (`dispatchOrder`)
3. `apps/api/src/modules/reporting-filing/reporting-filing.controller.ts`:
   - `@Throttle(REPORT_JOBS_RATE_LIMIT)` on `POST reports/jobs` (`createReportJob`)
4. `apps/api/tests/unit/throttling.test.ts`:
   - Added unit test coverage verifying `limit`, `ttl`, and `blockDuration` metadata for all three routes.
5. `tests/integration/system-remediation/sr-ops-capacity-20260911/ops-capacity-acceptance.test.ts`:
   - Provided pickup and dropoff coordinates in `TAIPEI_CORE` for all seeded orders.

---

## 4. Verification Evidence

### 4.1 Local Tests & Static Checks

- **Throttling Unit Tests**:
  ```bash
  pnpm --filter @drts/api test tests/unit/throttling.test.ts
  ```
  Result: 11/11 tests passed.
- **Plan-Builder Unit Tests**:
  ```bash
  pnpm exec vitest run tests/unit/system-remediation/sr-ops-capacity-20260911/
  ```
  Result: 8/8 tests passed.
- **API TypeScript Check**:
  ```bash
  pnpm exec tsc -p apps/api/tsconfig.json --noEmit
  ```
  Result: 0 errors.
- **Canonical Consistency**:
  ```bash
  python3 tools/ci/git/check_canonical_consistency.py --ci --base origin/dev --head HEAD
  ```
  Result: 0 findings across all checks.
- **i18n Guard**:
  ```bash
  node tools/ci/i18n-guard.mjs
  ```
  Result: OK (560 files scanned, 55 baseline exemptions).

### 4.2 GitHub Actions Acceptance Run

- **Workflow**: `Ops Capacity Acceptance` (Workflow ID `355541058`, file `.github/workflows/ops-capacity-acceptance.yml`)
- **Run ID**: `34743828491`
- **Run URL**: https://github.com/ajoe734/drts-fleet-platform/actions/runs/34743828491
- **Job ID**: `103687950905` (`acceptance`)
- **Candidate SHA**: `ba3fa0e2438d79936ec80e30235bbb320b5dfd81`
- **Duration**: 16m 58s (Harness execution: 919.35s)
- **Status**: `success` (All gates passed: install, migrate, unit, harness, gate)

#### Run Metrics & SLA Conformance

| Workload | Target Rate | Total Req | Successful | Errors | Error Rate | p95 Latency | p95 Target | p99 Latency | p99 Target | SLA Met |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Booking** | 60/min | 900 | 879 | 21 | 2.3% | 70.24 ms | ≤ 2,000 ms | 75.39 ms | ≤ 5,000 ms | **YES** |
| **Dispatch** | 300/min | 4,500 | 4,425 | 75 | 1.6% | 10.91 ms | ≤ 10,000 ms | 13.47 ms | — | **YES** |
| **Report** | 30/min | 450 | 436 | 14 | 3.1% | 66.70 ms | ≤ 5,000 ms | 74.06 ms | — | **YES** |

#### Conflict & Durable Readback Verification

- **HTTP 409 Conflict Count**: `0` (Zero conflict errors observed; coordinate seeding completely resolved `service_area` gate failure).
- **Postgres Durable Readback**:
  - `booking`: expected `879`, found `879`, missing `[]`, `matched: true`
  - `dispatch`: expected `4425`, found `4425`, missing `[]`, `matched: true`
  - `report`: expected `436`, found `436`, missing `[]`, `matched: true`
- **Dispatch Order Status Distribution**: `delayed_queue: 4425`
- **Queue Lag**:
  - `report`: avg `26.86 ms`, min `0 ms`, max `70 ms`
  - `dispatchOrderWriteLag`: avg `456.79 s`

